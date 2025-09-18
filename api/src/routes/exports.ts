import express from 'express';
import Joi from 'joi';
import { prisma, rabbitmqChannel } from '../index';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { TalkFlowError, createSuccessResponse } from '@talkflow/shared';

const router = express.Router();

// Validation schema for export requests
const exportSchema = Joi.object({
  format: Joi.string().valid('PDF', 'MARKDOWN', 'JSON').required(),
  destination: Joi.string().valid('EMAIL', 'GOOGLE_DOCS', 'NOTION', 'SLACK', 'DOWNLOAD').required(),
  options: Joi.object({
    includeTranscript: Joi.boolean().default(false),
    includeTimestamps: Joi.boolean().default(true),
    emailRecipients: Joi.array().items(Joi.string().email()).when('destination', {
      is: 'EMAIL',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    slackChannel: Joi.string().when('destination', {
      is: 'SLACK',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    notionPageId: Joi.string().when('destination', {
      is: 'NOTION',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).default({})
});

// Export meeting notes
router.post('/meetings/:meetingId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;
    const { error, value } = exportSchema.validate(req.body);
    
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    // Check if user has access to this meeting
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        OR: [
          { hostId: req.user!.id },
          {
            participants: {
              some: { userId: req.user!.id }
            }
          }
        ]
      },
      include: {
        notes: true
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or access denied', 'NOT_FOUND', 404);
    }

    if (!meeting.notesEnabled) {
      throw new TalkFlowError('Notes were not enabled for this meeting', 'NOTES_DISABLED', 400);
    }

    if (!meeting.notes) {
      throw new TalkFlowError('Notes have not been generated yet', 'NOTES_NOT_READY', 400);
    }

    const { format, destination, options } = value;

    // Create export job
    const exportJob = {
      meetingId,
      userId: req.user!.id,
      format,
      destination,
      options,
      timestamp: new Date().toISOString()
    };

    // Send to export queue
    if (rabbitmqChannel) {
      await rabbitmqChannel.sendToQueue(
        'export_jobs',
        Buffer.from(JSON.stringify(exportJob)),
        { persistent: true }
      );
    }

    // For DOWNLOAD format, we'll return immediately with a job ID
    // In a real implementation, you'd track export jobs in the database
    const jobId = `export_${meetingId}_${Date.now()}`;

    res.status(202).json(createSuccessResponse({
      jobId,
      status: 'processing',
      estimatedCompletionTime: new Date(Date.now() + 30000).toISOString() // 30 seconds
    }, 'Export job started successfully'));

  } catch (error) {
    next(error);
  }
});

// Get export job status (for future implementation)
router.get('/jobs/:jobId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;

    // In a real implementation, you'd track export jobs in the database
    // For now, return a mock response
    const mockStatus = {
      jobId,
      status: 'completed',
      format: 'PDF',
      destination: 'DOWNLOAD',
      downloadUrl: `https://api.talkflow.com/exports/download/${jobId}`,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    res.json(createSuccessResponse(mockStatus));
  } catch (error) {
    next(error);
  }
});

// Download exported file (for future implementation)
router.get('/download/:jobId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { jobId } = req.params;

    // In a real implementation, you'd:
    // 1. Verify the job belongs to the user
    // 2. Check if the file exists
    // 3. Stream the file to the client
    
    // For now, return a mock PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-notes-${jobId}.pdf"`);
    res.send(Buffer.from('Mock PDF content'));
    
  } catch (error) {
    next(error);
  }
});

// Generate meeting summary (immediate response for simple cases)
router.get('/meetings/:meetingId/summary', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

    // Check if user has access to this meeting
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        OR: [
          { hostId: req.user!.id },
          {
            participants: {
              some: { userId: req.user!.id }
            }
          }
        ]
      },
      include: {
        host: {
          select: { name: true }
        },
        participants: {
          include: {
            user: {
              select: { name: true }
            }
          }
        },
        notes: {
          include: {
            themes: true,
            importantNotes: true,
            decisions: true,
            actionItems: {
              include: {
                assignedTo: {
                  include: {
                    user: {
                      select: { name: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or access denied', 'NOT_FOUND', 404);
    }

    if (!meeting.notesEnabled || !meeting.notes) {
      // Generate a basic summary without AI notes
      const basicSummary = {
        title: meeting.title,
        date: meeting.startedAt,
        duration: meeting.startedAt && meeting.endedAt 
          ? Math.round((meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60000) 
          : null,
        host: meeting.host.name,
        participants: meeting.participants.map(p => p.user.name),
        summary: `Meeting "${meeting.title}" was held with ${meeting.participants.length} participants.`,
        hasAINotes: false
      };

      return res.json(createSuccessResponse(basicSummary));
    }

    // Generate rich summary with AI notes
    const richSummary = {
      title: meeting.title,
      date: meeting.startedAt,
      duration: meeting.startedAt && meeting.endedAt 
        ? Math.round((meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60000) 
        : null,
      host: meeting.host.name,
      participants: meeting.participants.map(p => p.user.name),
      summary: meeting.notes.summary,
      themes: meeting.notes.themes.map(theme => ({
        title: theme.title,
        description: theme.description,
        confidence: theme.confidence
      })),
      keyPoints: meeting.notes.importantNotes.map(note => ({
        content: note.content,
        importance: note.importance
      })),
      decisions: meeting.notes.decisions.map(decision => ({
        title: decision.title,
        description: decision.description,
        timestamp: decision.timestamp
      })),
      actionItems: meeting.notes.actionItems.map(item => ({
        title: item.title,
        description: item.description,
        assignedTo: item.assignedTo?.user.name,
        dueDate: item.dueDate,
        status: item.status
      })),
      hasAINotes: true
    };

    res.json(createSuccessResponse(richSummary));
  } catch (error) {
    next(error);
  }
});

// Get available export formats and destinations
router.get('/options', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const options = {
      formats: [
        {
          value: 'PDF',
          label: 'PDF Document',
          description: 'Professional PDF format suitable for sharing and printing'
        },
        {
          value: 'MARKDOWN',
          label: 'Markdown',
          description: 'Plain text format with formatting, great for documentation'
        },
        {
          value: 'JSON',
          label: 'JSON Data',
          description: 'Structured data format for integration with other tools'
        }
      ],
      destinations: [
        {
          value: 'DOWNLOAD',
          label: 'Download File',
          description: 'Download the exported file directly to your device'
        },
        {
          value: 'EMAIL',
          label: 'Send via Email',
          description: 'Send the exported notes to specified email addresses',
          requiresOptions: ['emailRecipients']
        },
        {
          value: 'GOOGLE_DOCS',
          label: 'Google Docs',
          description: 'Create a new Google Docs document with the meeting notes'
        },
        {
          value: 'NOTION',
          label: 'Notion',
          description: 'Add the notes to a Notion page',
          requiresOptions: ['notionPageId']
        },
        {
          value: 'SLACK',
          label: 'Slack',
          description: 'Post the summary to a Slack channel',
          requiresOptions: ['slackChannel']
        }
      ]
    };

    res.json(createSuccessResponse(options));
  } catch (error) {
    next(error);
  }
});

export default router;
