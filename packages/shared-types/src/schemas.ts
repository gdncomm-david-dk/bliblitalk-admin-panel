import { z } from "zod";
import {
  EventStatus,
  RegistrationStatus,
  Attendance,
  Role,
  ReminderKind,
  EmploymentType,
  SelectionMode,
} from "./enums";

// ---- Auth ----
// Neither app has a login endpoint any more, so there is no login input to describe:
// bliblitalk-admin sits behind Apps Gateway and reads the X-User-Id header (2026-08-06),
// and bliblitalk-user-fe authenticates participants by emailed one-time code (2026-08-04).
// LoginInput (email + password) and MicrosoftAuthInput (the mocked Entra ID sign-in) were
// deleted with the handlers that consumed them.

// Self-registration for participants. No password: since the 2026-08 change,
// bliblitalk-user-fe authenticates participants purely by emailed one-time code, so
// registration collects the profile and then issues the first OTP. Submitting this
// creates nothing — the profile comes back in the registration token below and the
// account is created only once the code is verified.
export const RegisterInput = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email(),
  phone: z.string().min(1, "Phone number is required"),
  institution: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  yearsOfExperience: z.string().optional().nullable(),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

// Email one-time-code login (bliblitalk-user-fe). Requesting a code invalidates any
// prior unconsumed one; verifying it issues the session.
export const OtpRequestInput = z.object({
  email: z.string().email(),
});
export type OtpRequestInput = z.infer<typeof OtpRequestInput>;

export const OtpVerifyInput = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifyInput>;

// Second half of registration. registrationToken is the signed, short-lived token
// /auth/register handed back; it carries the profile the applicant typed, which is
// why none of it has to be stored server-side while the code is outstanding. The
// account is created when this succeeds — never before.
export const RegisterVerifyInput = z.object({
  registrationToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});
export type RegisterVerifyInput = z.infer<typeof RegisterVerifyInput>;

// Re-send the registration code. Returns a fresh token, since it points at a new
// challenge — the caller must replace the one it holds.
export const RegisterResendInput = z.object({
  registrationToken: z.string().min(1),
});
export type RegisterResendInput = z.infer<typeof RegisterResendInput>;

// A participant editing their own profile (bliblitalk-user-fe Account Settings). Field names
// mirror RegisterInput so the same values keep the same names in both directions; `role` is the
// applicant's job title, stored on User.position (User.role is the RBAC role and is not editable
// here). Email is deliberately absent: it is the sign-in identifier, so changing it needs an
// ownership proof (a code to the new address), not a profile save.
export const UpdateProfileInput = z.object({
  fullName: z.string().min(1, "Full name is required"),
  institution: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  yearsOfExperience: z.string().optional().nullable(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

// ---- Core DTOs (API response contracts) ----
export const UserDTO = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(Role),
  department: z.string().nullable(),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  institution: z.string().nullable(),
  yearsOfExperience: z.string().nullable(),
});
export type UserDTO = z.infer<typeof UserDTO>;

export const SpeakerDTO = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  bioShort: z.string().nullable(),
  bioLong: z.string().nullable(),
  credentials: z.array(z.string()),
  avatarUrl: z.string().nullable(),
  featured: z.boolean(),
});
export type SpeakerDTO = z.infer<typeof SpeakerDTO>;

export const CreateSpeakerInput = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  bioShort: z.string().optional().nullable(),
  bioLong: z.string().optional().nullable(),
  credentials: z.array(z.string()).optional().default([]),
  avatarUrl: z.string().optional().nullable(),
  featured: z.boolean().optional().default(false),
});
export type CreateSpeakerInput = z.infer<typeof CreateSpeakerInput>;

export const UpdateSpeakerInput = CreateSpeakerInput.partial();
export type UpdateSpeakerInput = z.infer<typeof UpdateSpeakerInput>;

/** Speaker row for the admin management page — DTO plus usage count. */
export const AdminSpeakerDTO = SpeakerDTO.extend({
  eventCount: z.number().int(),
});
export type AdminSpeakerDTO = z.infer<typeof AdminSpeakerDTO>;

export const CategoryDTO = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});
export type CategoryDTO = z.infer<typeof CategoryDTO>;

export const CreateCategoryInput = z.object({
  name: z.string().min(1, "Name is required"),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const UpdateCategoryInput = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

/** Category row for the admin management page — DTO plus usage count. */
export const AdminCategoryDTO = CategoryDTO.extend({
  eventCount: z.number().int(),
});
export type AdminCategoryDTO = z.infer<typeof AdminCategoryDTO>;

// ---- Event detail-page content (CMS-editable) ----
export const LearningPointDTO = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});
export type LearningPointDTO = z.infer<typeof LearningPointDTO>;

export const DiscussionPointDTO = z.object({
  title: z.string(),
  description: z.string(),
});
export type DiscussionPointDTO = z.infer<typeof DiscussionPointDTO>;

export const AgendaItemDTO = z.object({
  startTime: z.string(),
  endTime: z.string(),
  title: z.string(),
  description: z.string(),
  durationMin: z.number().int(),
});
export type AgendaItemDTO = z.infer<typeof AgendaItemDTO>;

export const FaqItemDTO = z.object({
  question: z.string(),
  answer: z.string(),
});
export type FaqItemDTO = z.infer<typeof FaqItemDTO>;

// Which sections render on the portal's Past Event page.
export const EventDisplayConfig = z.object({
  pastEvent: z.boolean(),
  speaker: z.boolean(),
  gallery: z.boolean(),
  keyTakeaways: z.boolean(),
  recording: z.boolean(),
  certificate: z.boolean(),
});
export type EventDisplayConfig = z.infer<typeof EventDisplayConfig>;

export const DEFAULT_DISPLAY_CONFIG: EventDisplayConfig = {
  pastEvent: true,
  speaker: true,
  gallery: true,
  keyTakeaways: true,
  recording: true,
  certificate: true,
};

export const NextAutoTransition = z
  .object({ to: z.nativeEnum(EventStatus), at: z.string() })
  .nullable();
export type NextAutoTransition = z.infer<typeof NextAutoTransition>;

export const EventStatusHistoryDTO = z.object({
  id: z.string(),
  fromStatus: z.nativeEnum(EventStatus).nullable(),
  toStatus: z.nativeEnum(EventStatus),
  actorType: z.enum(["ADMIN", "SYSTEM"]),
  actorId: z.string().nullable(),
  reason: z.string().nullable(),
  sideEffectsStatus: z.enum(["PENDING", "DONE", "FAILED", "NONE"]),
  createdAt: z.string(),
});
export type EventStatusHistoryDTO = z.infer<typeof EventStatusHistoryDTO>;

export const TransitionEventInput = z.object({
  to: z.nativeEnum(EventStatus),
  reason: z.string().optional(),
});
export type TransitionEventInput = z.infer<typeof TransitionEventInput>;

export const EventDTO = z.object({
  id: z.string(),
  slug: z.string(),
  eventCode: z.string().nullable(),
  title: z.string(),
  subtitle: z.string().nullable(),
  // One image per shape the UI renders — wide hero, landscape card, portrait poster.
  // Consumers must resolve them through the poster → thumbnail → banner fallback rather
  // than reading a single field, so a partially-filled event still renders everywhere.
  bannerUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  posterUrl: z.string().nullable(),
  description: z.string(),
  category: z.string(),
  categoryId: z.string(),
  tags: z.array(z.string()),
  location: z.string(),
  startsAt: z.string(), // ISO string
  endsAt: z.string(), // ISO string
  capacity: z.number().int(),
  seatsTaken: z.number().int(),
  showRemainingSeats: z.boolean(),
  status: z.nativeEnum(EventStatus),
  hasSpeedDating: z.boolean(),
  enableCertificate: z.boolean(),
  enableFeedback: z.boolean(),
  waitingListEnabled: z.boolean(),
  venue: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  speakers: z.array(SpeakerDTO),
  registrationDeadline: z.string().nullable(),
  eventType: z.string().nullable(),
  dressCode: z.string().nullable(),
  language: z.string().nullable(),
  organizedBy: z.string().nullable(),
  importantNotes: z.string().nullable(),
  learningPoints: z.array(LearningPointDTO),
  discussionPoints: z.array(DiscussionPointDTO),
  agenda: z.array(AgendaItemDTO),
  faqs: z.array(FaqItemDTO),
  galleryImages: z.array(z.string()),
  recordingUrl: z.string().nullable(),
  presentationUrl: z.string().nullable(),
  displayConfig: EventDisplayConfig,
  statusChangedAt: z.string(),
  isOverdue: z.boolean(),
  selectionMode: z.nativeEnum(SelectionMode),
  registrationOpensAt: z.string().nullable(),
  nextAutoTransition: NextAutoTransition,
});
export type EventDTO = z.infer<typeof EventDTO>;

export const AnnouncementDTO = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  publishedAt: z.string(),
  pinned: z.boolean(),
});
export type AnnouncementDTO = z.infer<typeof AnnouncementDTO>;

// ---- Global site settings (CMS-editable) ----
export const SiteSettingsDTO = z.object({
  contactEmail: z.string().email(),
});
export type SiteSettingsDTO = z.infer<typeof SiteSettingsDTO>;

// ---- Login page carousel (admin CMS + participant portal each have their own) ----
export const LoginCarouselSlideDTO = z.object({
  heading: z.string().min(1),
  imageUrl: z.string().nullable(),
});
export type LoginCarouselSlideDTO = z.infer<typeof LoginCarouselSlideDTO>;

export const LoginCarouselSettingsDTO = z.object({
  slides: z.array(LoginCarouselSlideDTO),
});
export type LoginCarouselSettingsDTO = z.infer<typeof LoginCarouselSettingsDTO>;

export const DEFAULT_ADMIN_LOGIN_CAROUSEL_SETTINGS: LoginCarouselSettingsDTO = {
  slides: [
    { heading: "Manage events end to end", imageUrl: null },
    { heading: "Review shortlists and attendance", imageUrl: null },
    { heading: "Run the Talent Engagement Platform", imageUrl: null },
  ],
};

export const DEFAULT_PORTAL_LOGIN_CAROUSEL_SETTINGS: LoginCarouselSettingsDTO = {
  slides: [
    { heading: "Learn from the best practitioners", imageUrl: null },
    { heading: "Connect with industry leaders", imageUrl: null },
    { heading: "Grow your career with Blibli Talk", imageUrl: null },
  ],
};

/**
 * One testimonial card on the public landing page.
 *
 * The avatar initials are deliberately NOT a field: they are derived from `name` when the card
 * renders, so an admin cannot leave them stale after renaming someone, and there is one less
 * box to fill in for every entry.
 */
export const TestimonialDTO = z.object({
  quote: z.string().min(1),
  name: z.string().min(1),
  /** Free text under the name, e.g. "Associate PM · Joined 2024". Optional — some have none. */
  meta: z.string(),
});
export type TestimonialDTO = z.infer<typeof TestimonialDTO>;

/**
 * The landing page's testimonial list. An array with no fixed length: adding, removing and
 * reordering entries is a settings edit, never a schema change — which is the whole reason this
 * lives in ModuleSettings' JSON rather than in its own table.
 */
export const TestimonialsSettingsDTO = z.object({
  items: z.array(TestimonialDTO),
});
export type TestimonialsSettingsDTO = z.infer<typeof TestimonialsSettingsDTO>;

/** Seeded from the copy the landing page shipped with, so the page looks unchanged until edited. */
export const DEFAULT_TESTIMONIALS_SETTINGS: TestimonialsSettingsDTO = {
  items: [
    {
      quote:
        "I asked a question at a free talk, joined the mentor circle, and three months later I had my first PM offer. Unbelievable community.",
      name: "Fajar Ramadhan",
      meta: "Associate PM · Joined 2024",
    },
    {
      quote:
        "The hackathon brief went straight into my portfolio. Two interviews brought it up before I could. Genuinely practical education.",
      name: "Tania Saputri",
      meta: "UI/UX Student · Joined 2025",
    },
    {
      quote:
        "Rp 99.000 a month is a steal for the replay library. It's become my commute podcast now, instead of scrolling randomly.",
      name: "Robby Valeri",
      meta: "Frontend Engineer · Joined 2023",
    },
  ],
};

export const CertificateDTO = z.object({
  id: z.string(),
  eventTitle: z.string(),
  issuedAt: z.string(),
  verificationCode: z.string(),
});
export type CertificateDTO = z.infer<typeof CertificateDTO>;

export const DashboardStats = z.object({
  registered: z.number().int(),
  shortlisted: z.number().int(),
  attended: z.number().int(),
  certificates: z.number().int(),
});
export type DashboardStats = z.infer<typeof DashboardStats>;

export const NextEventDTO = z.object({
  event: EventDTO,
  status: z.nativeEnum(RegistrationStatus),
});
export type NextEventDTO = z.infer<typeof NextEventDTO>;

export const DashboardDTO = z.object({
  user: UserDTO,
  featuredEvent: EventDTO.nullable(),
  stats: DashboardStats,
  recommended: z.array(EventDTO),
  nextEvent: NextEventDTO.nullable(),
  upcomingEvents: z.array(EventDTO),
  // Events that have actually finished (status COMPLETED), newest first. Kept separate from
  // upcomingEvents because the portal's "Learn more from past events" grid used to fall back
  // to the upcoming list, which showed events that had not happened yet.
  pastEvents: z.array(EventDTO),
});
export type DashboardDTO = z.infer<typeof DashboardDTO>;

// ---- My Events ----
export const MyEventDTO = z.object({
  id: z.string(), // registration id
  event: EventDTO,
  status: z.nativeEnum(RegistrationStatus),
  attendance: z.nativeEnum(Attendance),
  certificateAvailable: z.boolean(),
  feedbackSubmitted: z.boolean(),
  speedDatingCompleted: z.boolean(),
  // null when the registrant hasn't joined speed dating for this event.
  speedDating: z
    .object({
      status: z.string(),
      sessionInfo: z.string().nullable(),
    })
    .nullable(),
});
export type MyEventDTO = z.infer<typeof MyEventDTO>;

// ---- Feedback (post-attendance) ----
// 1-10 rating per dimension + a standard 0-10 NPS question. Submittable only once
// attendance is PRESENT, and gates certificate download (see registrations service).
export const FeedbackInput = z.object({
  overallRating: z.number().int().min(1).max(10),
  topicRating: z.number().int().min(1).max(10),
  qnaRating: z.number().int().min(1).max(10),
  contentRating: z.number().int().min(1).max(10),
  speakerRating: z.number().int().min(1).max(10),
  venueRating: z.number().int().min(1).max(10),
  timingRating: z.number().int().min(1).max(10),
  npsScore: z.number().int().min(0).max(10),
  takeaway: z.string().optional().nullable(),
  topicsWanted: z.string().optional().nullable(),
  speakerWanted: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
});
export type FeedbackInput = z.infer<typeof FeedbackInput>;

export const FeedbackDTO = FeedbackInput.extend({
  id: z.string(),
  createdAt: z.string(),
});
export type FeedbackDTO = z.infer<typeof FeedbackDTO>;

// ---- Registration actions ----
export const RegisterEventInput = z.object({
  joinSpeedDating: z.boolean().optional().default(false),
});
export type RegisterEventInput = z.infer<typeof RegisterEventInput>;

// ---- Admin CMS: event CRUD ----
// Core event fields the Admin CMS creates/edits, plus the CMS-editable detail-page
// content (learningPoints, gallery, recording, presentation) and display config
// surfaced in the Event Content / Settings tabs of the event workspace.
export const AdminEventInput = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase, hyphen-separated")
    .optional(),
  subtitle: z.string().optional().nullable(),
  eventCode: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
  posterUrl: z.string().optional().nullable(),
  description: z.string().min(1, "Description is required"),
  categoryId: z.string().min(1, "Category is required"),
  tags: z.array(z.string()).optional().default([]),
  location: z.string().min(1, "Location is required"),
  startsAt: z.string().min(1, "Start time is required"),
  endsAt: z.string().min(1, "End time is required"),
  capacity: z.number().int().min(0).optional().default(0),
  showRemainingSeats: z.boolean().optional().default(true),
  hasSpeedDating: z.boolean().optional().default(false),
  enableCertificate: z.boolean().optional().default(true),
  enableFeedback: z.boolean().optional().default(false),
  waitingListEnabled: z.boolean().optional().default(true),
  venue: z.string().optional().nullable(),
  mapsUrl: z.string().optional().nullable(),
  registrationDeadline: z.string().optional().nullable(),
  eventType: z.string().optional().nullable(),
  dressCode: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  organizedBy: z.string().optional().nullable(),
  importantNotes: z.string().optional().nullable(),
  learningPoints: z.array(LearningPointDTO).optional(),
  galleryImages: z.array(z.string()).optional(),
  speakerIds: z.array(z.string()).optional(),
  recordingUrl: z.string().optional().nullable(),
  presentationUrl: z.string().optional().nullable(),
  displayConfig: EventDisplayConfig.partial().optional(),
  selectionMode: z.nativeEnum(SelectionMode).optional(),
  registrationOpensAt: z.string().optional().nullable(),
});
export type AdminEventInput = z.infer<typeof AdminEventInput>;

// Same shape, but every field optional — PATCH only touches what's sent.
export const AdminEventUpdateInput = AdminEventInput.partial();
export type AdminEventUpdateInput = z.infer<typeof AdminEventUpdateInput>;

export const AdminEventListQuery = z.object({
  status: z.nativeEnum(EventStatus).optional(),
});
export type AdminEventListQuery = z.infer<typeof AdminEventListQuery>;

// Manual status override — bypasses the publish/cancel lifecycle's own guardrails
// (required-fields check, etc.) since the admin is explicitly forcing a value.
export const AdminEventStatusInput = z.object({
  status: z.nativeEnum(EventStatus),
});
export type AdminEventStatusInput = z.infer<typeof AdminEventStatusInput>;

// ---- Admin CMS: participant management ----
export const AdminRegistrationDTO = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  userAvatarUrl: z.string().nullable(),
  userDepartment: z.string().nullable(),
  userPosition: z.string().nullable(),
  userYearsOfExperience: z.string().nullable(),
  status: z.nativeEnum(RegistrationStatus),
  attendance: z.nativeEnum(Attendance),
  createdAt: z.string(),
  shortlistedAt: z.string().nullable(),
  checkedInAt: z.string().nullable(),
  certificateCode: z.string().nullable(),
  feedbackSubmitted: z.boolean(),
});
export type AdminRegistrationDTO = z.infer<typeof AdminRegistrationDTO>;

// ---- Admin CMS: certificates ----
export const AdminCertificateDTO = z.object({
  id: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  verificationCode: z.string(),
  issuedAt: z.string(),
});
export type AdminCertificateDTO = z.infer<typeof AdminCertificateDTO>;

export const GenerateCertificatesResult = z.object({
  generated: z.number().int(),
  certificates: z.array(AdminCertificateDTO),
});
export type GenerateCertificatesResult = z.infer<typeof GenerateCertificatesResult>;

// ---- Admin CMS: feedback ----
export const FeedbackDimensionAverages = z.object({
  overall: z.number(),
  topic: z.number(),
  qna: z.number(),
  content: z.number(),
  speaker: z.number(),
  venue: z.number(),
  timing: z.number(),
});
export type FeedbackDimensionAverages = z.infer<typeof FeedbackDimensionAverages>;

export const StarDistributionEntry = z.object({
  stars: z.number().int(), // 1-5, derived from overallRating/2 rounded
  count: z.number().int(),
});
export type StarDistributionEntry = z.infer<typeof StarDistributionEntry>;

export const WordCloudEntry = z.object({
  word: z.string(),
  count: z.number().int(),
});
export type WordCloudEntry = z.infer<typeof WordCloudEntry>;

export const AdminFeedbackCommentDTO = z.object({
  id: z.string(),
  userName: z.string(),
  overallRating: z.number().int(),
  comments: z.string().nullable(),
  takeaway: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminFeedbackCommentDTO = z.infer<typeof AdminFeedbackCommentDTO>;

export const AdminEventFeedbackDTO = z.object({
  responses: z.number().int(),
  completionRate: z.number(), // responses / present attendees, 0-100
  averages: FeedbackDimensionAverages, // 1-10 scale
  recommendationRate: z.number(), // % of NPS score >= 9, 0-100
  starDistribution: z.array(StarDistributionEntry), // always 5 entries, stars 1-5
  wordCloud: z.array(WordCloudEntry),
  comments: z.array(AdminFeedbackCommentDTO),
});
export type AdminEventFeedbackDTO = z.infer<typeof AdminEventFeedbackDTO>;

// ---- Admin CMS: speed dating ----
export const AdminSpeedDatingRegistrationDTO = z.object({
  id: z.string(), // speed-dating registration id
  registrationId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  sessionInfo: z.string().nullable(),
  status: z.string(),
});
export type AdminSpeedDatingRegistrationDTO = z.infer<typeof AdminSpeedDatingRegistrationDTO>;

// ---- Admin CMS: analytics ----
export const CategoryBreakdownDTO = z.object({
  category: z.string(),
  count: z.number().int(),
});
export type CategoryBreakdownDTO = z.infer<typeof CategoryBreakdownDTO>;

export const StatusBreakdownDTO = z.object({
  status: z.nativeEnum(RegistrationStatus),
  count: z.number().int(),
});
export type StatusBreakdownDTO = z.infer<typeof StatusBreakdownDTO>;

export const EventAttendanceDTO = z.object({
  eventId: z.string(),
  title: z.string(),
  registrations: z.number().int(),
  present: z.number().int(),
  attendanceRate: z.number(), // 0-100, rounded
});
export type EventAttendanceDTO = z.infer<typeof EventAttendanceDTO>;

export const AdminAnalyticsDTO = z.object({
  eventsByCategory: z.array(CategoryBreakdownDTO),
  registrationsByStatus: z.array(StatusBreakdownDTO),
  topEventsByRegistrations: z.array(EventAttendanceDTO),
  eventAttendance: z.array(EventAttendanceDTO),
});
export type AdminAnalyticsDTO = z.infer<typeof AdminAnalyticsDTO>;

// ---- Admin CMS dashboard ----
export const AdminDashboardStats = z.object({
  totalEvents: z.number().int(),
  upcomingEvents: z.number().int(),
  totalRegistrations: z.number().int(),
  attendanceRate: z.number(), // 0-100, rounded
  shortlistedCount: z.number().int(),
  speedDatingParticipants: z.number().int(),
  certificatesIssued: z.number().int(),
});
export type AdminDashboardStats = z.infer<typeof AdminDashboardStats>;

export const AdminRecentRegistrationDTO = z.object({
  id: z.string(),
  userName: z.string(),
  eventTitle: z.string(),
  status: z.nativeEnum(RegistrationStatus),
  createdAt: z.string(),
});
export type AdminRecentRegistrationDTO = z.infer<typeof AdminRecentRegistrationDTO>;

export const AdminUpcomingEventDTO = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.nativeEnum(EventStatus),
  registrationsCount: z.number().int(),
  capacity: z.number().int(),
});
export type AdminUpcomingEventDTO = z.infer<typeof AdminUpcomingEventDTO>;

export const AdminDashboardDTO = z.object({
  stats: AdminDashboardStats,
  recentRegistrations: z.array(AdminRecentRegistrationDTO),
  upcomingCalendar: z.array(AdminUpcomingEventDTO),
});
export type AdminDashboardDTO = z.infer<typeof AdminDashboardDTO>;

// ---- Query params ----
// Portal-facing coarse filter, decoupled from the raw EventStatus enum. DRAFT and
// CANCELLED events are never returned to the portal. Case-insensitive.
//   upcoming  -> PUBLISHED + REGISTRATION_CLOSED
//   completed -> COMPLETED
export const PortalEventFilter = {
  UPCOMING: "upcoming",
  COMPLETED: "completed",
} as const;
export type PortalEventFilter = (typeof PortalEventFilter)[keyof typeof PortalEventFilter];

export const EventListQuery = z.object({
  status: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() : v),
    z.nativeEnum(PortalEventFilter).optional(),
  ),
});
export type EventListQuery = z.infer<typeof EventListQuery>;

// Which slice of the speaker roster the portal is asking for. Case-insensitive, and the two
// values answer genuinely different questions rather than being a limit knob:
//   featured (default) -> the curated strip: speakers an admin flagged, falling back to the
//                         whole roster only so the strip is never empty
//   all                -> the full directory behind "Show full speaker list", where a featured
//                         filter would be actively wrong — a list that calls itself complete
//                         must not silently hide the speakers nobody has flagged yet
export const SpeakerScope = {
  FEATURED: "featured",
  ALL: "all",
} as const;
export type SpeakerScope = (typeof SpeakerScope)[keyof typeof SpeakerScope];

export const SpeakerListQuery = z.object({
  scope: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() : v),
    z.nativeEnum(SpeakerScope).optional(),
  ),
});
export type SpeakerListQuery = z.infer<typeof SpeakerListQuery>;

// ---- Module settings (admin-configurable, singleton-per-key JSON blobs) ----
export const SpeedDatingSettingsDTO = z.object({
  roundDurationMinutes: z.number().int().min(1).max(120),
  groupSize: z.number().int().min(2).max(20),
  introMessage: z.string().nullable(),
});
export type SpeedDatingSettingsDTO = z.infer<typeof SpeedDatingSettingsDTO>;
export const DEFAULT_SPEED_DATING_SETTINGS: SpeedDatingSettingsDTO = {
  roundDurationMinutes: 5,
  groupSize: 4,
  introMessage: null,
};

// Feedback dimensions are fixed columns on the Feedback model (see schema.prisma) —
// settings only control each dimension's displayed question text and whether it
// renders on the portal form, not the underlying data shape.
export const FEEDBACK_QUESTION_KEYS = [
  "overallRating",
  "topicRating",
  "qnaRating",
  "contentRating",
  "speakerRating",
  "venueRating",
  "timingRating",
  "npsScore",
  "takeaway",
  "topicsWanted",
  "speakerWanted",
  "comments",
] as const;
export const FeedbackQuestionKey = z.enum(FEEDBACK_QUESTION_KEYS);
export type FeedbackQuestionKey = z.infer<typeof FeedbackQuestionKey>;

export const FeedbackQuestionConfig = z.object({
  key: FeedbackQuestionKey,
  label: z.string().min(1),
  enabled: z.boolean(),
});
export type FeedbackQuestionConfig = z.infer<typeof FeedbackQuestionConfig>;

export const FeedbackSettingsDTO = z.object({
  questions: z.array(FeedbackQuestionConfig),
});
export type FeedbackSettingsDTO = z.infer<typeof FeedbackSettingsDTO>;
export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettingsDTO = {
  questions: [
    { key: "overallRating", label: "Overall, how satisfied were you with this Blibli Talk session?", enabled: true },
    { key: "topicRating", label: "How relevant was the topic to your professional interests?", enabled: true },
    { key: "qnaRating", label: "How engaging and insightful was the discussion and Q&A format?", enabled: true },
    { key: "contentRating", label: "How would you rate the quality of the content and insight shared?", enabled: true },
    { key: "speakerRating", label: "How engaging was the speaker throughout the session?", enabled: true },
    { key: "venueRating", label: "How satisfied were you with the venue and overall ambiance?", enabled: true },
    { key: "timingRating", label: "How convenient was the event timing?", enabled: true },
    {
      key: "npsScore",
      label: "How likely are you to recommend Blibli Talk sessions to your colleagues or friends?",
      enabled: true,
    },
    { key: "takeaway", label: "What was your most valuable takeaway from this session?", enabled: true },
    { key: "topicsWanted", label: "Which topics would you love to see in future Blibli Talk sessions?", enabled: true },
    { key: "speakerWanted", label: "Is there a particular speaker you'd like to see at the next Blibli Talk?", enabled: true },
    {
      key: "comments",
      label: "Any comments or suggestions to help us make future Blibli Talk sessions even better?",
      enabled: true,
    },
  ],
};

export const CertificateSettingsDTO = z.object({
  headline: z.string().min(1),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  signatoryName: z.string().nullable(),
  signatoryTitle: z.string().nullable(),
  footerNote: z.string().nullable(),
});
export type CertificateSettingsDTO = z.infer<typeof CertificateSettingsDTO>;
export const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettingsDTO = {
  headline: "Certificate of Participation",
  accentColor: "#1668ff",
  signatoryName: null,
  signatoryTitle: null,
  footerNote: null,
};

// ---- Registrant database (admin: all users + how many events they've joined) ----
export const RegistrantDTO = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  institution: z.string().nullable(),
  department: z.string().nullable(),
  position: z.string().nullable(),
  yearsOfExperience: z.string().nullable(),
  role: z.nativeEnum(Role),
  employmentType: z.nativeEnum(EmploymentType),
  eventsJoinedCount: z.number().int(),
  lastJoinedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type RegistrantDTO = z.infer<typeof RegistrantDTO>;

export const RegistrantListResult = z.object({
  items: z.array(RegistrantDTO),
  total: z.number().int(),
});
export type RegistrantListResult = z.infer<typeof RegistrantListResult>;

export const UpdateUserRoleInput = z.object({
  role: z.nativeEnum(Role),
});
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleInput>;

export const UpdateUserEmploymentTypeInput = z.object({
  employmentType: z.nativeEnum(EmploymentType),
});
export type UpdateUserEmploymentTypeInput = z.infer<typeof UpdateUserEmploymentTypeInput>;

// Grants an Admin CMS role to a staff member (no self-registration path for staff).
// Caller must hold Permission.ROLE_MANAGE; the service additionally restricts `role` to
// ADMIN_ROLES (no provisioning PARTICIPANT).
//
// No password since the 2026-08-06 Apps Gateway migration: the person signs in through the
// gateway with their company account, and this row exists only to attach an app-level role
// to their email. Whether they may reach the app at all is the gateway's WHITELIST, which
// is managed at /auth/ui/apps and not by this endpoint.
export const CreateAdminUserInput = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email(),
  // Can't reference @repo/auth's ADMIN_ROLES here (auth depends on shared-types, so
  // that import would be circular) — excluding PARTICIPANT is the schema-level
  // equivalent, so a future refactor can't accidentally drop the guard entirely by
  // removing the service-layer ADMIN_ROLES check.
  role: z.nativeEnum(Role).refine((r) => r !== Role.PARTICIPANT, "Role must be one of the Admin CMS roles"),
});
export type CreateAdminUserInput = z.infer<typeof CreateAdminUserInput>;

// ---- Marketing: contacts + email campaigns ----
export const MarketingContactDTO = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
});
export type MarketingContactDTO = z.infer<typeof MarketingContactDTO>;

export const AddMarketingContactInput = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
});
export type AddMarketingContactInput = z.infer<typeof AddMarketingContactInput>;

export const AddMarketingContactsBulkInput = z.object({
  emails: z.array(z.string().email()).min(1),
});
export type AddMarketingContactsBulkInput = z.infer<typeof AddMarketingContactsBulkInput>;

export const EmailCampaignDTO = z.object({
  id: z.string(),
  subject: z.string(),
  bodyHtml: z.string(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
  recipientCount: z.number().int(),
  sentCount: z.number().int(),
  failedCount: z.number().int(),
});
export type EmailCampaignDTO = z.infer<typeof EmailCampaignDTO>;

export const CreateCampaignInput = z.object({
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  contactIds: z.array(z.string()).default([]),
  extraEmails: z.array(z.string().email()).default([]),
  audience: z.enum(["selected", "all"]).default("selected"),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInput>;

// ---- Per-event reminders ----
export const EventReminderStatus = z.enum(["PENDING", "SENT", "FAILED"]);
export type EventReminderStatus = z.infer<typeof EventReminderStatus>;

// CUSTOM: subject/bodyHtml only, sent to SHORTLISTED registrants.
// SHORTLIST_RESULT: subject/bodyHtml go to SHORTLISTED registrants,
// subjectNotShortlisted/bodyHtmlNotShortlisted go to everyone else still
// active — one send, two audiences.
export const EventReminderDTO = z.object({
  id: z.string(),
  eventId: z.string(),
  kind: z.nativeEnum(ReminderKind),
  sendAt: z.string(),
  subject: z.string(),
  bodyHtml: z.string(),
  subjectNotShortlisted: z.string().nullable(),
  bodyHtmlNotShortlisted: z.string().nullable(),
  status: EventReminderStatus,
  sentAt: z.string().nullable(),
  recipientCount: z.number().int(),
  sentCount: z.number().int(),
  failedCount: z.number().int(),
  createdAt: z.string(),
});
export type EventReminderDTO = z.infer<typeof EventReminderDTO>;

export const CreateReminderInput = z
  .object({
    kind: z.nativeEnum(ReminderKind).optional().default(ReminderKind.CUSTOM),
    sendAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
    subject: z.string().min(1),
    bodyHtml: z.string().min(1),
    subjectNotShortlisted: z.string().min(1).optional(),
    bodyHtmlNotShortlisted: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.kind !== ReminderKind.SHORTLIST_RESULT) return;
    if (!input.subjectNotShortlisted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectNotShortlisted"],
        message: "Required for SHORTLIST_RESULT reminders",
      });
    }
    if (!input.bodyHtmlNotShortlisted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bodyHtmlNotShortlisted"],
        message: "Required for SHORTLIST_RESULT reminders",
      });
    }
  });
export type CreateReminderInput = z.infer<typeof CreateReminderInput>;
