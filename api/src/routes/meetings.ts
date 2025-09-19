import express from 'express';
import Joi from 'joi';
import { prisma, rabbitmqChannel } from '../index';
import { authenticateToken, AuthenticatedRequest, optionalAuth } from '../middleware/auth';
import { meetingRateLimiter } from '../middleware/rateLimiter';
import { createApiResponse, generateRoomCode } from '../types/shared';

// Custom error class
class TalkFlowError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
    this.name = 'TalkFlowError';
  }
}

const router = express.Router();

// Validation schemas
const createMeetingSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(1000).optional(),
  notesEnabled: Joi.boolean().default(false)
});

const inviteSchema = Joi.object({
  invitations: Joi.array().items(
    Joi.object({
      email: Joi.string().email().optional(),
      phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional()
    }).or('email', 'phone')
  ).min(1).required()
});

// Get meetings for current user
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: {
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
          select: { id: true, name: true, email: true, phone: true, avatar: true }
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        },
        _count: {
          select: { transcripts: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(createApiResponse(meetings));
  } catch (error) {
    next(error);
  }
});

// Create new meeting
router.post('/', authenticateToken, meetingRateLimiter, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { error, value } = createMeetingSchema.validate(req.body);
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    const { title, description, notesEnabled } = value;

    const meeting = await prisma.meeting.create({
      data: {
        title,
        description,
        hostId: req.user!.id,
        notesEnabled,
        roomCode: generateRoomCode()
      },
      include: {
        host: {
          select: { id: true, name: true, email: true, phone: true, avatar: true }
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        }
      }
    });

    // Create host as participant
    await prisma.participant.create({
      data: {
        userId: req.user!.id,
        meetingId: meeting.id,
        role: 'HOST'
      }
    });

    res.status(201).json(createApiResponse(meeting, 'Meeting created successfully'));
  } catch (error) {
    next(error);
  }
});

// Get specific meeting
router.get('/:meetingId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

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
          select: { id: true, name: true, email: true, phone: true, avatar: true }
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        },
        invitations: {
          select: {
            id: true,
            email: true,
            phone: true,
            status: true,
            invitedAt: true,
            respondedAt: true
          }
        },
        notes: {
          include: {
            themes: true,
            importantNotes: true,
            decisions: true,
            actionItems: true
          }
        }
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found', 'NOT_FOUND', 404);
    }

    res.json(createApiResponse(meeting));
  } catch (error) {
    next(error);
  }
});

// Update meeting
router.patch('/:meetingId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;
    const { error, value } = createMeetingSchema.validate(req.body);
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    // Check if user is host
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        hostId: req.user!.id
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or you are not the host', 'NOT_FOUND', 404);
    }

    if (meeting.status === 'ACTIVE') {
      throw new TalkFlowError('Cannot update active meeting', 'INVALID_OPERATION', 400);
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: value,
      include: {
        host: {
          select: { id: true, name: true, email: true, phone: true, avatar: true }
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        }
      }
    });

    res.json(createApiResponse(updatedMeeting, 'Meeting updated successfully'));
  } catch (error) {
    next(error);
  }
});

// Delete meeting
router.delete('/:meetingId', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

    // Check if user is host
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        hostId: req.user!.id
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or you are not the host', 'NOT_FOUND', 404);
    }

    if (meeting.status === 'ACTIVE') {
      throw new TalkFlowError('Cannot delete active meeting', 'INVALID_OPERATION', 400);
    }

    await prisma.meeting.delete({
      where: { id: meetingId }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Join meeting by room code
router.post('/join/:roomCode', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { roomCode } = req.params;

    const meeting = await prisma.meeting.findUnique({
      where: { roomCode },
      include: {
        host: {
          select: { id: true, name: true, email: true, phone: true, avatar: true }
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, avatar: true }
            }
          }
        }
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found', 'NOT_FOUND', 404);
    }

    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') {
      throw new TalkFlowError('Meeting has ended', 'MEETING_ENDED', 400);
    }

    let participant = null;

    // If user is authenticated, create/update participant
    if (req.user) {
      participant = await prisma.participant.upsert({
        where: {
          userId_meetingId: {
            userId: req.user.id,
            meetingId: meeting.id
          }
        },
        update: {
          joinedAt: new Date(),
          leftAt: null
        },
        create: {
          userId: req.user.id,
          meetingId: meeting.id,
          role: 'PARTICIPANT'
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, avatar: true }
          }
        }
      });
    }

    res.json(createApiResponse({
      meeting,
      participant
    }, 'Joined meeting successfully'));
  } catch (error) {
    next(error);
  }
});

// Join meeting by ID (for authenticated users)
router.post('/:meetingId/join', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found', 'NOT_FOUND', 404);
    }

    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') {
      throw new TalkFlowError('Meeting has ended', 'MEETING_ENDED', 400);
    }

    const participant = await prisma.participant.upsert({
      where: {
        userId_meetingId: {
          userId: req.user!.id,
          meetingId: meeting.id
        }
      },
      update: {
        joinedAt: new Date(),
        leftAt: null
      },
      create: {
        userId: req.user!.id,
        meetingId: meeting.id,
        role: 'PARTICIPANT'
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, avatar: true }
        }
      }
    });

    res.json(createApiResponse(participant, 'Joined meeting successfully'));
  } catch (error) {
    next(error);
  }
});

// Leave meeting
router.post('/:meetingId/leave', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

    const participant = await prisma.participant.findFirst({
      where: {
        userId: req.user!.id,
        meetingId: meetingId
      }
    });

    if (!participant) {
      throw new TalkFlowError('You are not a participant in this meeting', 'NOT_FOUND', 404);
    }

    await prisma.participant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Start meeting
router.post('/:meetingId/start', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        hostId: req.user!.id
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or you are not the host', 'NOT_FOUND', 404);
    }

    if (meeting.status === 'ACTIVE') {
      throw new TalkFlowError('Meeting is already active', 'INVALID_OPERATION', 400);
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date()
      }
    });

    // If notes are enabled, start transcription service
    if (meeting.notesEnabled && rabbitmqChannel) {
      await rabbitmqChannel.sendToQueue(
        'transcription_jobs',
        Buffer.from(JSON.stringify({
          meetingId: meeting.id,
          action: 'start'
        })),
        { persistent: true }
      );
    }

    res.json(createApiResponse(updatedMeeting, 'Meeting started successfully'));
  } catch (error) {
    next(error);
  }
});

// End meeting
router.post('/:meetingId/end', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;

    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        hostId: req.user!.id
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or you are not the host', 'NOT_FOUND', 404);
    }

    if (meeting.status !== 'ACTIVE') {
      throw new TalkFlowError('Meeting is not active', 'INVALID_OPERATION', 400);
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'ENDED',
        endedAt: new Date()
      }
    });

    // Update all participants as left
    await prisma.participant.updateMany({
      where: {
        meetingId: meetingId,
        leftAt: null
      },
      data: { leftAt: new Date() }
    });

    // If notes were enabled, trigger notes processing
    if (meeting.notesEnabled && rabbitmqChannel) {
      await rabbitmqChannel.sendToQueue(
        'notes_processing',
        Buffer.from(JSON.stringify({
          meetingId: meeting.id,
          action: 'process'
        })),
        { persistent: true }
      );
    }

    res.json(createApiResponse(updatedMeeting, 'Meeting ended successfully'));
  } catch (error) {
    next(error);
  }
});

// Invite users to meeting
router.post('/:meetingId/invite', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { meetingId } = req.params;
    const { error, value } = inviteSchema.validate(req.body);
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    // Check if user is host
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        hostId: req.user!.id
      }
    });

    if (!meeting) {
      throw new TalkFlowError('Meeting not found or you are not the host', 'NOT_FOUND', 404);
    }

    const { invitations } = value;
    const createdInvitations = [];

    for (const invitation of invitations) {
      const { email, phone } = invitation;

      // Check if user exists in system
      let existingUser = null;
      if (email || phone) {
        existingUser = await prisma.user.findFirst({
          where: {
            OR: [
              email ? { email } : {},
              phone ? { phone } : {}
            ].filter(condition => Object.keys(condition).length > 0)
          }
        });
      }

      // Create invitation
      const newInvitation = await prisma.meetingInvitation.create({
        data: {
          meetingId: meeting.id,
          userId: existingUser?.id,
          email: email,
          phone: phone,
          status: 'PENDING'
        }
      });

      createdInvitations.push(newInvitation);

      // TODO: Send invitation via email/SMS
      console.log(`Invitation sent to ${email || phone} for meeting: ${meeting.title}`);
    }

    res.status(201).json(createApiResponse(createdInvitations, 'Invitations sent successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;
