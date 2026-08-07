import dayjs from "dayjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clean in FK-safe order so the seed is re-runnable.
  await prisma.speedDatingRegistration.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.event.deleteMany();
  await prisma.speaker.deleteMany();
  // Registration challenges have no userId at all (see schema.prisma), so the FK cascade
  // below would leave them behind — this delete is the only thing that clears them.
  await prisma.otpChallenge.deleteMany();
  await prisma.user.deleteMany();

  // ---- Categories ----
  // Owned by the seed itself (not just the migration's one-time INSERT) so this
  // file is self-contained on any freshly-migrated database.
  const CATEGORY_NAMES = ["Leadership", "Self Development", "Technology", "Career Growth", "Design"];
  for (const name of CATEGORY_NAMES) {
    await prisma.eventCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ---- User ----
  // No seeded password: neither app authenticates with one. bliblitalk-user-fe signs
  // participants in by emailed one-time code, and bliblitalk-admin sits behind Apps
  // Gateway — locally, the admin frontend's DEV-only /dev-login stands in for it.
  const demo = await prisma.user.create({
    data: {
      email: "demo@gdn-commerce.com",
      name: "User External",
      department: "Partnership",
      position: "External Partner",
      phone: "+62 812 0000 0000",
    },
  });

  // ---- Speakers ----
  const mk = (
    name: string,
    title: string,
    featured = false,
    company = "Blibli",
  ) => prisma.speaker.create({ data: { name, title, company, featured } });

  const indra = await prisma.speaker.create({
    data: {
      name: "Indra Haryo Aryanto",
      title: "Behavioral Facilitator & Organizational Development Consultant · Lumina Certified Practitioner",
      company: "Lumina Learning",
      featured: true,
      bioLong: [
        "Indra Haryo Aryanto is a strategic transformation leader and certified behavioral facilitator whose 20+ year career spans the full arc of organizational life — from building brands inside global agencies, to driving commercial growth at digital banks and media platforms, to now facilitating leadership transformation for governments, UN agencies, and enterprises across Indonesia.",
        "His professional journey is itself a study in pressure, reinvention, and staying grounded. From strategic planning at Saatchi & Saatchi and Ogilvy to leading digital banking launches at DBS and UOB, to heading growth at a tech startup, to stepping fully into independent consulting and facilitation — Indra has made multiple deliberate transitions, each one demanding a different version of himself.",
        "Today he works with clients including UN Women Indonesia, Bappenas, Indonesia's Ministry of Education, Telkom Indonesia, and Universitas Indonesia — helping leaders navigate complexity, align across differences, and build cultures capable of sustaining change.",
      ].join("\n\n"),
      credentials: [
        "Lumina Spark Certified (2024)",
        "Lumina Leader Certified (2024)",
        "BA — Universitas Indonesia",
        "Advanced Dev — Aalto University",
        "Exec Ed — London School of Economics",
        "Writing Program — Harvard University",
      ],
    },
  });
  const lilyane = await mk("Lilyane Dewi", "Director of Business Development, BIA/GMS");
  const josephine = await mk("Josephine Gratia", "Commercial Partnership Lead, F&S");
  const claresa = await mk("Claresa Wahyu", "Talent Acquisition & Partnership Lead", true);
  const shanty = await mk("Shanty Cantya", "Group Head of Blibli Care");
  const nazrya = await mk("Nazrya Octora", "Head of Public Relations");
  const andreas = await mk(
    "Andreas",
    "Group Head Brand & Communications Blibli · Founder of Tu7uh Creative Lab · Former CCO of Dentsu Indonesia",
    true,
  );
  const yohanes = await mk("Yohanes Lukman", "Head of CEO Office & Business Development, BEM");
  const henry = await mk("Henry Lowis", "Leasing Director, APAC Key Accounts");
  const rangga = await mk("Rangga Pratama", "Head of Data & AI");

  const t = (iso: string) => dayjs(`${iso}+07:00`).toDate();

  // Common sidebar meta so every event has something to show; the featured
  // event below overrides these with fully authored CMS content.
  const defaultMeta = (startsAt: Date) => ({
    registrationDeadline: dayjs(startsAt).subtract(2, "day").toDate(),
    eventType: "On-site Talk Show + Networking",
    dressCode: "Smart Casual",
    language: "Bahasa Indonesia",
    organizedBy: "People Development Team",
    importantNotes:
      "Please arrive 15 minutes early for registration. Seats are limited and shortlisted attendees will be notified by email within 2 business days.",
  });

  // ---- Events ----
  const notLostStartsAt = t("2026-08-13T18:30:00");
  const notLost = await prisma.event.create({
    data: {
      slug: "not-lost-in-translation",
      eventCode: "blibli Talk 11",
      title: "(Not) Lost in Translation",
      subtitle: "A Self-Discovery Workshop on Pressure, Change, and Staying Human",
      description: [
        "Pressure has always been part of professional life. But lately, it feels different. Economic uncertainty, a competitive job market, and an always-on culture have created a reality where many professionals carry far more than anyone around them knows.",
        `Pressure doesn't always look like pressure. Sometimes it looks like productivity. Sometimes it looks like ambition. Sometimes it looks like smiling, showing up, and saying "I'm fine" — because stopping doesn't feel like an option.`,
        "This is not a wellness seminar or a motivational talk. It is a grounded, honest dialogue about what it means to stay human when the system keeps demanding more — drawing on behavioral insight, real organizational experience, and the courage to name what most people only think.",
      ].join("\n\n"),
      category: { connect: { name: "Leadership" } },
      tags: ["Leadership", "Self Development"],
      location: "Wing A Auditorium, Blibli HQ Sarana Jaya",
      startsAt: notLostStartsAt,
      endsAt: t("2026-08-13T20:30:00"),
      capacity: 150,
      status: "REGISTRATION_OPEN",
      hasSpeedDating: true,
      featured: true,
      registrationDeadline: t("2026-08-11T23:59:00"),
      eventType: "On-site Talk Show + Networking",
      dressCode: "Smart Casual",
      language: "Bahasa Indonesia",
      organizedBy: "People Development Team",
      importantNotes:
        "Please arrive 15 minutes early for registration. Seats are limited and shortlisted attendees will be notified by email within 2 business days.",
      learningPoints: [
        {
          icon: "calendar",
          title: "Behavioral Self-Awareness",
          description:
            "Understanding your own patterns under pressure — what Lumina calls your underlying and overextended self.",
        },
        {
          icon: "home",
          title: "Organizational Resilience",
          description:
            "How transformation experience teaches you to navigate pressure at both the individual and systemic level.",
        },
        {
          icon: "trending",
          title: "Sustainable Ambition",
          description:
            "Staying driven and purposeful without losing yourself — even when the environment keeps demanding more.",
        },
        {
          icon: "users",
          title: "Practical Ways to Stay Human",
          description:
            "Behavioral tools for building self-awareness, sustaining resilience, and healthier habits inside high-pressure environments.",
        },
      ],
      discussionPoints: [
        {
          title: "Why Does Everything Feel So Heavy Right Now?",
          description:
            "How external uncertainty, economic pressure, and an always-on culture quietly shape our inner state — and why the smartest professionals are often the last to notice.",
        },
        {
          title: `When "I'm Fine" Becomes a Survival Strategy`,
          description:
            "The behavioral reality behind the professional mask: what Lumina's pressure science tells us about why high-performers push through even when overwhelmed.",
        },
        {
          title: "Transformation Fatigue: When Change Itself Becomes the Pressure",
          description:
            "How constant change in organizations, industries, and careers creates its own unique exhaustion that most professionals don't have language for yet.",
        },
        {
          title: "The Identity Trap: When Who You Are Gets Tied to What You Produce",
          description:
            "How ambition, performance, and professional identity quietly blur together — and what it looks like to untangle these.",
        },
        {
          title: "Practical Ways to Stay Human in Survival Mode",
          description:
            "Behavioral tools and perspectives from Lumina frameworks for building self-awareness and healthier habits in high-pressure environments.",
        },
      ],
      agenda: [
        {
          startTime: "18.30",
          endTime: "18.35",
          title: "Arrival & Registration",
          description: "Doors open, guests settle in, ambient setup",
          durationMin: 5,
        },
        {
          startTime: "18.35",
          endTime: "18.40",
          title: "Opening by Host",
          description:
            "Host sets context: what this conversation is about and why it matters. Introduction of Indra Haryo Aryanto.",
          durationMin: 5,
        },
        {
          startTime: "18.40",
          endTime: "19.25",
          title: "Talk Show with Indra Haryo Aryanto",
          description:
            "Guided conversation — personal stories, behavioral insights, and practical perspectives on pressure, resilience, and staying human under organizational and career demands.",
          durationMin: 45,
        },
        {
          startTime: "19.25",
          endTime: "19.55",
          title: "Q&A Session",
          description:
            "Open floor: audience questions, honest reflections, and real conversations about pressure, burnout, and wellbeing at work.",
          durationMin: 30,
        },
        {
          startTime: "19.55",
          endTime: "20.00",
          title: "Closing & Key Takeaways",
          description: "Host wraps with key messages. Closing remarks and photo opportunity with speaker.",
          durationMin: 5,
        },
        {
          startTime: "20.00",
          endTime: "20.30",
          title: "Networking",
          description: "Light refreshments, open mingling, speaker meet-and-greet.",
          durationMin: 30,
        },
      ],
      faqs: [
        {
          question: "Who can join Blibli Talk?",
          answer:
            "Blibli Talk is open to everyone — both internal employees and external participants are welcome to register while seats are open.",
        },
        {
          question: "Is this event free to attend?",
          answer: "Yes, Blibli Talk sessions are free — just register while seats are open.",
        },
        {
          question: "What happens if the event is full?",
          answer:
            "You'll be added to the waitlist automatically. If a seat opens up, waitlisted registrants are considered first.",
        },
        {
          question: "Is Speed Dating included in this session?",
          answer:
            "Yes — this event includes an optional Speed Dating segment for participants to connect directly with the speaker. You can opt in when you register.",
        },
      ],
      recordingUrl: "https://www.youtube.com/watch?v=blibli-talk-11-recap",
      speakers: { connect: [{ id: indra.id }] },
    },
  });

  const learningStartsAt = t("2026-09-17T18:30:00");
  const learning = await prisma.event.create({
    data: {
      slug: "learning-how-to-learn",
      title: "Learning How to Learn – Building a Career That Never Stops Growing",
      subtitle: "Building a Career That Never Stops Growing",
      description: "Building a Career That Never Stops Growing",
      category: { connect: { name: "Self Development" } },
      tags: ["Self Development"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: learningStartsAt,
      endsAt: t("2026-09-17T20:30:00"),
      capacity: 150,
      status: "REGISTRATION_OPEN",
      ...defaultMeta(learningStartsAt),
      speakers: { connect: [{ id: lilyane.id }, { id: josephine.id }] },
    },
  });

  const aiStartsAt = t("2026-10-02T18:30:00");
  const ai = await prisma.event.create({
    data: {
      slug: "ai-in-everyday-work",
      title: "AI in Everyday Work: From Hype to Impact",
      subtitle: "Practical AI for real productivity",
      description: "Turning AI hype into everyday impact for teams.",
      category: { connect: { name: "Technology" } },
      tags: ["Technology"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: aiStartsAt,
      endsAt: t("2026-10-02T20:30:00"),
      capacity: 200,
      status: "REGISTRATION_OPEN",
      ...defaultMeta(aiStartsAt),
      speakers: { connect: [{ id: rangga.id }] },
    },
  });

  // Recommended (surface in the dashboard "Recommended For You" rail)
  const influenceStartsAt = t("2026-10-15T18:30:00");
  await prisma.event.create({
    data: {
      slug: "building-influence-as-a-leader",
      title: "Building Influence as a Leader",
      description: "Grow your leadership influence without authority.",
      category: { connect: { name: "Leadership" } },
      tags: ["Leadership"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: influenceStartsAt,
      endsAt: t("2026-10-15T20:30:00"),
      capacity: 150,
      status: "REGISTRATION_OPEN",
      recommended: true,
      // Shortlist-only: seat count hidden; every registrant waits to be shortlisted.
      showRemainingSeats: false,
      selectionMode: "CURATED",
      ...defaultMeta(influenceStartsAt),
    },
  });
  const futureOfWorkStartsAt = t("2026-10-29T18:30:00");
  await prisma.event.create({
    data: {
      slug: "future-of-work-skills",
      title: "The Future of Work: Skills You Need",
      description: "The skills that will matter most in the next decade.",
      category: { connect: { name: "Career Growth" } },
      tags: ["Career Growth"],
      location: "Online (Zoom)",
      startsAt: futureOfWorkStartsAt,
      endsAt: t("2026-10-29T20:30:00"),
      capacity: 500,
      status: "REGISTRATION_OPEN",
      recommended: true,
      ...defaultMeta(futureOfWorkStartsAt),
    },
  });
  const mindsetStartsAt = t("2026-11-05T18:30:00");
  await prisma.event.create({
    data: {
      slug: "mindset-for-continuous-growth",
      title: "Mindset for Continuous Growth",
      description: "Cultivating a growth mindset that compounds.",
      category: { connect: { name: "Self Development" } },
      tags: ["Self Development"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: mindsetStartsAt,
      endsAt: t("2026-11-05T20:30:00"),
      capacity: 150,
      status: "REGISTRATION_OPEN",
      recommended: true,
      ...defaultMeta(mindsetStartsAt),
    },
  });

  // Attended (past) events registered by the demo user
  const breakingStartsAt = t("2026-08-20T18:30:00");
  const breaking = await prisma.event.create({
    data: {
      slug: "breaking-fast-breaking-ideas",
      title: "Breaking Fast, Breaking Ideas – Inside the Making of Award-Winning Creative Work",
      subtitle: "Inside the Making of Award-Winning Creative Work",
      description: "Inside the Making of Award-Winning Creative Work",
      category: { connect: { name: "Design" } },
      tags: ["Design", "Leadership"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: breakingStartsAt,
      endsAt: t("2026-08-20T20:30:00"),
      capacity: 120,
      status: "COMPLETED",
      ...defaultMeta(breakingStartsAt),
      speakers: { connect: [{ id: andreas.id }] },
    },
  });

  const kartiniStartsAt = t("2026-07-08T18:30:00");
  const kartini = await prisma.event.create({
    data: {
      slug: "kartini-masa-gitu",
      title: "Kartini Masa Gitu? – Redefining Women Leadership Beyond Labels, Expectations, and Stereotypes",
      subtitle: "Redefining Women Leadership Beyond Labels, Expectations, and Stereotypes",
      description: "Redefining Women Leadership Beyond Labels, Expectations, and Stereotypes",
      category: { connect: { name: "Leadership" } },
      tags: ["Leadership"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: kartiniStartsAt,
      endsAt: t("2026-07-08T20:30:00"),
      capacity: 150,
      status: "COMPLETED",
      ...defaultMeta(kartiniStartsAt),
      speakers: { connect: [{ id: claresa.id }, { id: shanty.id }, { id: nazrya.id }] },
    },
  });

  const loveHateStartsAt = t("2026-06-11T18:30:00");
  const loveHate = await prisma.event.create({
    data: {
      slug: "love-hate-work-relationship",
      title: "Love (Hate) Work Relationship – Finding Passion, Purpose, and Staying in Love with Your Work",
      subtitle: "Finding Passion, Purpose, and Staying in Love with Your Work",
      description: "Finding Passion, Purpose, and Staying in Love with Your Work",
      category: { connect: { name: "Self Development" } },
      tags: ["Self Development"],
      location: "Blibli HQ, Sarana Jaya, 5th Floor",
      startsAt: loveHateStartsAt,
      endsAt: t("2026-06-11T20:30:00"),
      capacity: 120,
      status: "COMPLETED",
      hasSpeedDating: true,
      ...defaultMeta(loveHateStartsAt),
      speakers: { connect: [{ id: yohanes.id }, { id: henry.id }] },
    },
  });

  // ---- Registrations for the demo user (4 total) ----
  await prisma.registration.create({
    data: { userId: demo.id, eventId: learning.id, status: "SHORTLISTED", attendance: "PENDING" },
  });
  const breakingReg = await prisma.registration.create({
    data: { userId: demo.id, eventId: breaking.id, status: "REGISTERED", attendance: "PRESENT" },
  });
  const kartiniReg = await prisma.registration.create({
    data: { userId: demo.id, eventId: kartini.id, status: "REGISTERED", attendance: "PRESENT" },
  });
  const loveHateReg = await prisma.registration.create({
    data: { userId: demo.id, eventId: loveHate.id, status: "REGISTERED", attendance: "PRESENT" },
  });
  await prisma.speedDatingRegistration.create({
    data: { registrationId: loveHateReg.id, sessionInfo: "Session A", status: "COMPLETED" },
  });

  // ---- Admin CMS users (RBAC) ----
  await prisma.user.create({
    data: {
      email: "superadmin@gdn-commerce.com",
      name: "Super Admin",
      role: "SUPER_ADMIN",
      department: "People & Culture",
      position: "Platform Administrator",
    },
  });
  // Event Admin, scoped to two events via the EventAdmins assignment relation.
  const eventAdmin = await prisma.user.create({
    data: {
      email: "eventadmin@gdn-commerce.com",
      name: "Event Admin",
      role: "EVENT_ADMIN",
      department: "Talent Acquisition",
      position: "Event Organizer",
      adminEvents: { connect: [{ id: notLost.id }, { id: learning.id }] },
    },
  });
  // HR-scoped role — seeded so tests and local dev can exercise every ADMIN_ROLES tier,
  // not just SUPER_ADMIN/EVENT_ADMIN.
  await prisma.user.create({
    data: {
      email: "hrta@gdn-commerce.com",
      name: "HR Talent Acquisition",
      role: "HR_TA",
      department: "People & Culture",
      position: "Talent Acquisition Specialist",
    },
  });

  // Own the two assigned events; backfill publishedAt for the live ones.
  await prisma.event.updateMany({
    where: { id: { in: [notLost.id, learning.id] } },
    data: { ownerId: eventAdmin.id },
  });
  await prisma.event.updateMany({
    where: { status: "REGISTRATION_OPEN" },
    data: { publishedAt: t("2026-05-01T09:00:00") },
  });

  // ---- Lifecycle backfill: one synthetic EventStatusHistory row per non-DRAFT
  // seed event, mirroring the P7 migration's Steps B/C so local dev stays
  // consistent across every reseed (seed.ts wipes and recreates all events).
  const registrationOpenEvents = await prisma.event.findMany({
    where: { status: "REGISTRATION_OPEN" },
    select: { id: true, publishedAt: true },
  });
  const completedEvents = await prisma.event.findMany({
    where: { status: "COMPLETED" },
    select: { id: true, endsAt: true, autoCompleteAfterMinutes: true },
  });

  for (const e of registrationOpenEvents) {
    await prisma.event.update({
      where: { id: e.id },
      data: { statusChangedAt: e.publishedAt ?? new Date() },
    });
  }
  for (const e of completedEvents) {
    await prisma.event.update({
      where: { id: e.id },
      data: { statusChangedAt: dayjs(e.endsAt).add(e.autoCompleteAfterMinutes, "minute").toDate() },
    });
  }

  await prisma.eventStatusHistory.createMany({
    data: [
      ...registrationOpenEvents.map((e) => ({
        id: `histbf_${e.id}`,
        eventId: e.id,
        fromStatus: null,
        toStatus: "REGISTRATION_OPEN" as const,
        actorType: "SYSTEM",
        actorId: null,
        reason: "backfill",
        sideEffectsStatus: "NONE",
        createdAt: e.publishedAt ?? new Date(),
      })),
      ...completedEvents.map((e) => ({
        id: `histbf_${e.id}`,
        eventId: e.id,
        fromStatus: null,
        toStatus: "COMPLETED" as const,
        actorType: "SYSTEM",
        actorId: null,
        reason: "backfill",
        sideEffectsStatus: "DONE",
        createdAt: dayjs(e.endsAt).add(e.autoCompleteAfterMinutes, "minute").toDate(),
      })),
    ],
  });

  // Demo the seat-visibility toggle: hide the remaining-seats counter on one event.
  await prisma.event.update({
    where: { id: learning.id },
    data: { showRemainingSeats: false, selectionMode: "CURATED" },
  });

  // ---- Certificates (attended events) ----
  await prisma.certificate.createMany({
    data: [
      { userId: demo.id, eventId: breaking.id, verificationCode: "BT2-CERT-0001", issuedAt: t("2026-08-21T09:00:00") },
      { userId: demo.id, eventId: kartini.id, verificationCode: "BT2-CERT-0002", issuedAt: t("2026-07-09T09:00:00") },
      { userId: demo.id, eventId: loveHate.id, verificationCode: "BT2-CERT-0003", issuedAt: t("2026-06-12T09:00:00") },
    ],
  });

  // ---- Feedback (sample submissions, one per attended registration) ----
  await prisma.feedback.createMany({
    data: [
      {
        registrationId: breakingReg.id,
        userId: demo.id,
        eventId: breaking.id,
        overallRating: 9,
        topicRating: 9,
        qnaRating: 8,
        contentRating: 9,
        speakerRating: 10,
        venueRating: 8,
        timingRating: 7,
        npsScore: 9,
        takeaway: "Practical framework for breaking down tech debt into shippable chunks.",
        topicsWanted: "More on platform migrations",
        speakerWanted: null,
        comments: "Great session, would love a follow-up deep dive.",
      },
      {
        registrationId: kartiniReg.id,
        userId: demo.id,
        eventId: kartini.id,
        overallRating: 10,
        topicRating: 10,
        qnaRating: 9,
        contentRating: 10,
        speakerRating: 10,
        venueRating: 9,
        timingRating: 8,
        npsScore: 10,
        takeaway: "Inspiring perspective on women in leadership.",
        topicsWanted: "Career growth panels",
        speakerWanted: "Sri Mulyani",
        comments: "One of the best Blibli Talk sessions so far.",
      },
      {
        registrationId: loveHateReg.id,
        userId: demo.id,
        eventId: loveHate.id,
        overallRating: 8,
        topicRating: 8,
        qnaRating: 9,
        contentRating: 8,
        speakerRating: 9,
        venueRating: 7,
        timingRating: 6,
        npsScore: 8,
        takeaway: "The speed dating format made networking way less awkward.",
        topicsWanted: null,
        speakerWanted: null,
        comments: "Timing was a bit late for a weekday.",
      },
    ],
  });

  // ---- Announcements ----
  await prisma.announcement.createMany({
    data: [
      {
        title: "Welcome to Blibli Talk 2.0",
        body: "Discover events, register in one click, and download your certificates — all in one place.",
        publishedAt: t("2026-07-05T09:00:00"),
        pinned: true,
      },
      {
        title: "Speed Dating is back",
        body: "Selected events now offer Speed Dating sessions. Opt in when you register.",
        publishedAt: t("2026-07-02T09:00:00"),
        pinned: false,
      },
    ],
  });

  void [notLost, ai];

  // eslint-disable-next-line no-console
  console.log("Seed complete: 4 users (1 participant, super admin, event admin, HR/TA), 10 speakers, 9 events, 4 registrations, 3 certificates, 1 speed-dating, 2 announcements");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
