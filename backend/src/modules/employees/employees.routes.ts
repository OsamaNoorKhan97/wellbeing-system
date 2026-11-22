import { Router } from 'express';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { getActiveManager } from '../../services/assignment.service';
import { asyncHandler, ok } from '../../utils/http';
import { getBreakRecommendation } from '../alerts/alerts.service';
import { getAssessmentStatus, listOwnAssessments } from '../assessments/assessments.service';
import { listMeetings } from '../meetings/meetings.service';
import { listNotifications } from '../notifications/notifications.routes';
import { listRequests } from '../requests/requests.service';
import { getSurveyStatus } from '../surveys/surveys.service';

export const employeesRouter = Router();
employeesRouter.use(authenticate, authorize('EMPLOYEE'));

employeesRouter.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const [assessmentStatus, recentAssessments, surveyStatus, requests, meetings, notifications, manager, breakRecommendation] = await Promise.all([
      getAssessmentStatus(user.id),
      listOwnAssessments(user.id, 1, 7),
      getSurveyStatus(user.id),
      listRequests(user, { page: 1, pageSize: 5 }),
      listMeetings(user, { page: 1, pageSize: 5, scope: 'upcoming' }),
      listNotifications(user.id, 1, 5),
      getActiveManager(user.id),
      getBreakRecommendation(user.id),
    ]);
    ok(res, {
      assessmentStatus,
      recentAssessments: recentAssessments.items,
      surveyStatus,
      recentRequests: requests.items,
      upcomingMeetings: meetings.items,
      recentNotifications: notifications.items,
      unreadNotifications: notifications.unread,
      manager,
      breakRecommendation,
    });
  }),
);

employeesRouter.get('/me/manager', asyncHandler(async (req, res) => ok(res, await getActiveManager(currentUser(req).id))));
