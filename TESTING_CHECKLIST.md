# Campus Drive_Raju_version_9 — Testing Checklist

## Startup
- `docker compose up -d --build` starts MySQL, Redis, backend and frontend.
- `docker compose ps` shows all four services running.
- Redis is available at localhost:6379 for a systemd-hosted backend, or at the `redis` service name for the compose backend.

## Student exam
- Login during the real exam window succeeds at any point before the deadline.
- The old 15-minute first-login cutoff no longer exists.
- Login before the exam start is rejected as not started.
- Login after the exam end is rejected.
- A late entrant receives only the remaining time.
- Fullscreen gateway and existing exam navigation still work.
- Ten questions remain on each page.
- Selecting an MCQ updates the UI immediately.
- The answer is written to IndexedDB without waiting for the network.
- Leaving an unchanged page creates no save request.
- Leaving a changed page sends one dirty-answer batch to Redis.
- Returning to an unchanged page creates no comparison request to Redis.
- Changing an old answer marks only that answer/page dirty.
- Multiple quick changes do not create overlapping synchronization requests.
- An older delayed synchronization cannot overwrite a newer sequence.

## Connectivity
- Temporarily disconnect the network after changing answers.
- Continue navigating; local answers must remain visible.
- Reconnect; pending dirty data should retry.
- Redis outage must not erase IndexedDB answers.
- Manual/final submission must have a safe MySQL fallback if Redis is temporarily unavailable.

## Checkpoint
- Dirty Redis sessions are checkpointed to MySQL every 15 minutes by default.
- Only changed answer rows are updated where possible.
- Checkpoint transactions lock the student first, matching final-submit lock order.
- Checkpoint failures are retried up to three times with short backoff.

## Anti-cheat
- First tab/window/fullscreen violation => 5-minute restriction.
- Second violation => another 5-minute restriction.
- Third violation => TERMINATED.
- Actual exam deadline does not move during a restriction.
- Login while restricted shows the temporary restriction message.
- Login after restriction expiry resumes the existing exam state.
- Admin can override a restriction from Drives -> Ongoing Drives -> Drive -> Live Examination Control.
- Admin override does not erase violation history.
- Admin can force-submit an active/restricted/terminated attempt when safe live state is available.

## Submission
- Manual submit remains configurable and defaults to the existing 5-minute window.
- Submit sends the complete current browser answer state so the final operation is not dependent on a previous page sync.
- Final MySQL transaction saves answers, scores, result and activity.
- Duplicate submit does not create duplicate scoring/results.
- Deadline auto-submit works.
- Redis state is removed only after finalization succeeds.
- IndexedDB exam state is cleared only after confirmed successful submission.

## Admin Drives
- Drives -> Ongoing Drives shows drives whose real clock window is active.
- Opening an ongoing drive shows Live Examination Control.
- Live status comes from Redis when available, with MySQL safety fallback.
- Student status shows ACTIVE / RESTRICTED / TERMINATED / COMPLETED as applicable.
- Allow Resume changes live access back to ACTIVE.
- Force Submit finalizes the selected student.
- Existing student filters/export/table remain available.

## Regression
- Admin login and URL-key protection.
- Student registration.
- Student profile/rules/result pages.
- Question upload and question editing.
- Exam scheduling/rescheduling before first start.
- Existing Drives and College Overview navigation.
- Excel export.
- Public site content and exam settings.
