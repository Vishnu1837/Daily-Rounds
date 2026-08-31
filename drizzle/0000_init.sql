CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent');--> statement-breakpoint
CREATE TYPE "public"."check_in_completion" AS ENUM('completed', 'partial', 'none');--> statement-breakpoint
CREATE TYPE "public"."day_band" AS ENUM('perfect', 'strong', 'active', 'weak', 'missed', 'off');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('study_room', 'workshop', 'guest_session', 'weekly_review', 'assessment', 'other');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('pdf', 'drive', 'video', 'textbook', 'website', 'recording');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'paused', 'left');--> statement-breakpoint
CREATE TYPE "public"."obstacle" AS ENUM('procrastination', 'social_media', 'sleep', 'classes', 'unclear_what_to_study', 'lack_of_motivation', 'personal', 'other', 'none');--> statement-breakpoint
CREATE TYPE "public"."point_event" AS ENUM('daily_check_in', 'tomorrow_plan', 'live_session_present', 'live_session_late', 'study_block_completed', 'daily_target_completed', 'reflection', 'quiz_attempt', 'quiz_bonus', 'streak_bonus', 'achievement', 'weekly_review', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('on_track', 'at_risk', 'needs_intervention');--> statement-breakpoint
CREATE TYPE "public"."study_session_status" AS ENUM('running', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('upcoming', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"event_id" uuid,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"marked_by" uuid,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity" varchar(80) NOT NULL,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"completion" "check_in_completion" NOT NULL,
	"actual_minutes" integer DEFAULT 0 NOT NULL,
	"what_studied" text NOT NULL,
	"obstacle" "obstacle" DEFAULT 'none' NOT NULL,
	"obstacle_note" text,
	"tomorrow_target" text,
	"satisfaction" smallint NOT NULL,
	"reflection" text,
	"is_comeback" boolean DEFAULT false NOT NULL,
	"comeback_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_extra_study_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"active_weekdays" integer[] DEFAULT '{1,2,3,4,5}' NOT NULL,
	"streak_threshold_pct" smallint DEFAULT 70 NOT NULL,
	"meet_url" text,
	"meet_start_time" varchar(5) DEFAULT '06:00' NOT NULL,
	"meet_end_time" varchar(5) DEFAULT '07:00' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_active_day" boolean NOT NULL,
	"showed_up" boolean DEFAULT false NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"score_pct" smallint DEFAULT 0 NOT NULL,
	"band" "day_band" DEFAULT 'off' NOT NULL,
	"study_minutes" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_activity_member_id_date_pk" PRIMARY KEY("member_id","date")
);
--> statement-breakpoint
CREATE TABLE "daily_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"topic_id" uuid,
	"planned_minutes" integer DEFAULT 90 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"type" "event_type" DEFAULT 'other' NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"start_time" varchar(5) DEFAULT '18:00' NOT NULL,
	"end_time" varchar(5) DEFAULT '19:00' NOT NULL,
	"meet_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"subject_id" uuid,
	"topic_key" varchar(200),
	"title" varchar(200) NOT NULL,
	"description" text,
	"type" "material_type" DEFAULT 'website' NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"event" "point_event" NOT NULL,
	"points" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"event" "point_event" NOT NULL,
	"points" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"date" date NOT NULL,
	"score" smallint NOT NULL,
	"total" smallint NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" smallint NOT NULL,
	"explanation" text
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid,
	"topic_key" varchar(200) NOT NULL,
	"title" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roadmap_id" uuid NOT NULL,
	"week_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "topic_status" DEFAULT 'upcoming' NOT NULL,
	"estimated_minutes" integer DEFAULT 90 NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roadmap_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roadmap_id" uuid NOT NULL,
	"week_number" smallint NOT NULL,
	"title" varchar(160) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"track" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"code" varchar(48) NOT NULL,
	"earned_on" date NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"primary_subject_id" uuid,
	"secondary_subject_id" uuid,
	"cohort_goal" text NOT NULL,
	"daily_commitment_minutes" integer DEFAULT 90 NOT NULL,
	"exam_name" varchar(160),
	"exam_date" date,
	"baseline_days_studied_last_week" smallint NOT NULL,
	"baseline_consistency_rating" smallint NOT NULL,
	"baseline_confidence" smallint NOT NULL,
	"biggest_obstacle" "obstacle" NOT NULL,
	"obstacle_note" text,
	"final_consistency_rating" smallint,
	"final_confidence" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"topic_id" uuid,
	"planned_minutes" integer DEFAULT 90 NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"status" "study_session_status" DEFAULT 'running' NOT NULL,
	"resumed_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"accent" varchar(24) DEFAULT 'violet' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"whatsapp" varchar(32),
	"university" varchar(160),
	"mbbs_year" smallint,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"avatar_seed" varchar(32) DEFAULT 'dr' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"what_went_well" text NOT NULL,
	"what_stopped" text NOT NULL,
	"what_to_change" text NOT NULL,
	"subject_confidence" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_extra_study_days" ADD CONSTRAINT "cohort_extra_study_days_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_holidays" ADD CONSTRAINT "cohort_holidays_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_assignments" ADD CONSTRAINT "daily_assignments_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_assignments" ADD CONSTRAINT "daily_assignments_topic_id_roadmap_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."roadmap_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_topics" ADD CONSTRAINT "roadmap_topics_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_topics" ADD CONSTRAINT "roadmap_topics_week_id_roadmap_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."roadmap_weeks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_weeks" ADD CONSTRAINT "roadmap_weeks_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_achievements" ADD CONSTRAINT "student_achievements_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_goals" ADD CONSTRAINT "student_goals_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_goals" ADD CONSTRAINT "student_goals_primary_subject_id_subjects_id_fk" FOREIGN KEY ("primary_subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_goals" ADD CONSTRAINT "student_goals_secondary_subject_id_subjects_id_fk" FOREIGN KEY ("secondary_subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_topic_id_roadmap_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."roadmap_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_member_id_cohort_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."cohort_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_cohort_idx" ON "announcements" USING btree ("cohort_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_unique" ON "attendance" USING btree ("member_id","date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_idx" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_unique" ON "check_ins" USING btree ("member_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_extra_day_unique" ON "cohort_extra_study_days" USING btree ("cohort_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_holiday_unique" ON "cohort_holidays" USING btree ("cohort_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_member_unique" ON "cohort_members" USING btree ("cohort_id","user_id");--> statement-breakpoint
CREATE INDEX "cohort_member_cohort_idx" ON "cohort_members" USING btree ("cohort_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cohorts_slug_idx" ON "cohorts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "daily_activity_date_idx" ON "daily_activity" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_assignment_unique" ON "daily_assignments" USING btree ("member_id","date");--> statement-breakpoint
CREATE INDEX "events_cohort_date_idx" ON "events" USING btree ("cohort_id","date");--> statement-breakpoint
CREATE INDEX "materials_cohort_idx" ON "materials" USING btree ("cohort_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "point_rule_unique" ON "point_rules" USING btree ("cohort_id","event");--> statement-breakpoint
CREATE UNIQUE INDEX "points_idempotency_unique" ON "points_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "points_member_date_idx" ON "points_ledger" USING btree ("member_id","occurred_on");--> statement-breakpoint
CREATE INDEX "quiz_attempts_member_idx" ON "quiz_attempts" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_quiz_idx" ON "quiz_questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "roadmap_topics_roadmap_idx" ON "roadmap_topics" USING btree ("roadmap_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_week_unique" ON "roadmap_weeks" USING btree ("roadmap_id","week_number");--> statement-breakpoint
CREATE INDEX "roadmaps_member_idx" ON "roadmaps" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_achievement_unique" ON "student_achievements" USING btree ("member_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "student_goals_member_unique" ON "student_goals" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "study_sessions_member_date_idx" ON "study_sessions" USING btree ("member_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_slug_idx" ON "subjects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_review_unique" ON "weekly_reviews" USING btree ("member_id","week_start");