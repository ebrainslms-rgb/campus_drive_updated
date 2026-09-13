package com.ecobrains.lms.dto.response;

import java.time.LocalDate;

/** Read-only lookup used to display (never edit) the College field on the
 *  Login page once a student has typed a complete exam code - the Login
 *  form has no manual college selector at all; this is the only source
 *  of college info the student ever sees there.
 *
 *  status:
 *    "OK"        - collegeId/collegeName/location/state populated, safe
 *                  to display as read-only.
 *    "TOO_EARLY" - the exam hasn't happened yet; examDate populated so the
 *                  frontend can tell the student the actual scheduled date.
 *                  College is deliberately NOT revealed in this case.
 *    "EXPIRED"   - wrong day (after the exam) or past the late-login
 *                  window on the correct day. College is deliberately
 *                  NOT revealed - only a currently-loggable code exposes
 *                  which college it belongs to. */
public record ExamCollegeLookupResponse(
        String status, Long collegeId, String collegeName, String location, String state, LocalDate examDate
) {}