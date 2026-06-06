CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"type" text DEFAULT 'fixed' NOT NULL,
	"status" text DEFAULT 'empty' NOT NULL,
	"driver_name" text NOT NULL,
	"phone" text NOT NULL,
	"capacity" integer DEFAULT 4,
	"queue_position" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'hotel_pickup' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"flight_code" text,
	"passenger_count" integer DEFAULT 1 NOT NULL,
	"pickup_location" text NOT NULL,
	"dropoff_location" text NOT NULL,
	"scheduled_time" timestamp with time zone NOT NULL,
	"actual_pickup_time" timestamp with time zone,
	"actual_dropoff_time" timestamp with time zone,
	"vehicle_id" integer,
	"notes" text,
	"fee" numeric(10, 2),
	"km" numeric(8, 1),
	"import_key" text,
	"row_index" integer,
	"table_type" text,
	"shift_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "excel_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"filename" text NOT NULL,
	"data" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excel_files_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "route_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"pickup_location" text NOT NULL,
	"dropoff_location" text NOT NULL,
	"km" numeric(8, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting" ADD CONSTRAINT "accounting_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting" ADD CONSTRAINT "accounting_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicles_status_type_idx" ON "vehicles" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "vehicles_queue_position_idx" ON "vehicles" USING btree ("queue_position");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_import_key_idx" ON "tasks" USING btree ("import_key");--> statement-breakpoint
CREATE INDEX "tasks_scheduled_time_idx" ON "tasks" USING btree ("scheduled_time");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_shift_date_idx" ON "tasks" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "tasks_vehicle_id_idx" ON "tasks" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "tasks_shift_date_status_idx" ON "tasks" USING btree ("shift_date","status");--> statement-breakpoint
CREATE INDEX "accounting_vehicle_id_idx" ON "accounting" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "accounting_task_id_idx" ON "accounting" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "route_presets_route_idx" ON "route_presets" USING btree ("pickup_location","dropoff_location");