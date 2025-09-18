import express from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { TalkFlowError, createSuccessResponse } from '@talkflow/shared';

const router = express.Router();

// Get meeting notes
router.get('/meetings/:meetingId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
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
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or access denied', 'NOT_FOUND', 404);
    }

    if (!meeting.notesEnabled) {
      throw new TalkFlowError('Notes were not enabled for this meeting', 'NOTES_DISABLED', 400);
    }

    const notes = await prisma.meetingNotes.findUnique({
      where: { meetingId },
      include: {
        themes: {
          orderBy: { confidence: 'desc' }
        },
        importantNotes: {
          orderBy: { importance: 'desc' }
        },
        decisions: {
          orderBy: { timestamp: 'asc' },
          include: {
            decidedBy: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, phone: true }
                }
              }
            }
          }
        },
        actionItems: {
          orderBy: { id: 'asc' },
          include: {
            assignedTo: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, phone: true }
                }
              }
            }
          }
        }
      }
    });

    if (!notes) {
      // Notes haven't been generated yet
      return res.json(createSuccessResponse(null, 'Notes are being processed'));
    }

    res.json(createSuccessResponse(notes));
  } catch (error) {
    next(error);
  }
});

// Get meeting transcripts
router.get('/meetings/:meetingId/transcripts', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

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
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or access denied', 'NOT_FOUND', 404);
    }

    if (!meeting.notesEnabled) {
      throw new TalkFlowError('Transcription was not enabled for this meeting', 'TRANSCRIPTION_DISABLED', 400);
    }

    const [transcripts, total] = await Promise.all([
      prisma.transcript.findMany({
        where: { meetingId },
        include: {
          speaker: {
            include: {
              user: {
                select: { id: true, name: true, email: true, phone: true, avatar: true }
              }
            }
          }
        },
        orderBy: { timestamp: 'asc' },
        skip: offset,
        take: limit
      }),
      prisma.transcript.count({
        where: { meetingId }
      })
    ]);

    const response = {
      transcripts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };

    res.json(createSuccessResponse(response));
  } catch (error) {
    next(error);
  }
});

// Get transcript by speaker
router.get('/meetings/:meetingId/transcripts/speaker/:speakerId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId, speakerId } = req.params;

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
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or access denied', 'NOT_FOUND', 404);
    }

    const transcripts = await prisma.transcript.findMany({
      where: {
        meetingId,
        speakerId
      },
      include: {
        speaker: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    res.json(createSuccessResponse(transcripts));
  } catch (error) {
    next(error);
  }
});

// Search transcripts
router.get('/meetings/:meetingId/transcripts/search', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;
    const { q: query, speaker } = req.query;

    if (!query || typeof query !== 'string') {
      throw new TalkFlowError('Search query is required', 'VALIDATION_ERROR', 400);
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
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or access denied', 'NOT_FOUND', 404);
    }

    const whereClause: any = {
      meetingId,
      content: {
        contains: query,
        mode: 'insensitive'
      }
    };

    if (speaker && typeof speaker === 'string') {
      whereClause.speakerId = speaker;
    }

    const transcripts = await prisma.transcript.findMany({
      where: whereClause,
      include: {
        speaker: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    res.json(createSuccessResponse(transcripts));
  } catch (error) {
    next(error);
  }
});

// Update action item status
router.patch('/action-items/:actionItemId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { actionItemId } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
      throw new TalkFlowError('Invalid status', 'VALIDATION_ERROR', 400);
    }

    // Check if user has access to this action item
    const actionItem = await prisma.actionItem.findUnique({
      where: { id: actionItemId },
      include: {
        notes: {
          include: {
            meeting: {
              include: {
                participants: {
                  where: { userId: req.user!.id }
                }
              }
            }
          }
        }
      }
    });

    if (!actionItem) {
      throw new TalkFlowError('Action item not found', 'NOT_FOUND', 404);
    }

    // Check if user is a participant in the meeting
    if (actionItem.notes.meeting.participants.length === 0) {
      throw new TalkFlowError('Access denied', 'FORBIDDEN', 403);
    }

    const updatedActionItem = await prisma.actionItem.update({
      where: { id: actionItemId },
      data: { status },
      include: {
        assignedTo: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      }
    });

    res.json(createSuccessResponse(updatedActionItem, 'Action item updated successfully'));
  } catch (error) {
    next(error);
  }
});

// Get action items for user
router.get('/action-items/my', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const status = req.query.status as string;
    
    const whereClause: any = {
      assignedTo: {
        userId: req.user!.id
      }
    };

    if (status && ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
      whereClause.status = status;
    }

    const actionItems = await prisma.actionItem.findMany({
      where: whereClause,
      include: {
        notes: {
          include: {
            meeting: {
              select: {
                id: true,
                title: true,
                createdAt: true
              }
            }
          }
        },
        assignedTo: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true }
            }
          }
        }
      },
      orderBy: [
        { status: 'asc' },
        { dueDate: 'asc' }
      ]
    });

    res.json(createSuccessResponse(actionItems));
  } catch (error) {
    next(error);
  }
});

export default router;
