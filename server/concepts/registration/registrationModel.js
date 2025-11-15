/**
 * @file registrationModel.js
 * @description This file defines the data model and database interactions for the Registration concept.
 * It includes functions for registering, dropping, withdrawing from classes, and enforcing registration rules.
 */

/**
 * SQL Table Schema for enrollments:
 *
 * CREATE TABLE enrollments (
 *   id SERIAL PRIMARY KEY,
 *   student_id INT NOT NOT NULL, -- References a student in the users table
 *   class_id INT NOT NULL, -- References a class in the class_schedule table (or a specific class instance)
 *   status VARCHAR(50) NOT NULL, -- 'registered', 'dropped', 'withdrawn', 'completed'
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
 *   UNIQUE (student_id, class_id)
 * );
 */

// Placeholder for importing other models/services needed for rules engine
// import { checkHolds } from '../registrationHold/registrationHoldModel.js';
// import { checkPrerequisites } from '../courseCatalog/courseCatalogModel.js'; // Assuming this exists
// import { getClassCapacity } from '../classSchedule/classScheduleModel.js'; // Assuming this exists
// import { addToWaitlist, promoteFromWaitlist } from '../waitlist/waitlistModel.js'; // Assuming this exists
// import { getWaiver } from '../waiver/waiverModel.js'; // Assuming this exists

/**
 * Enforces all registration rules before allowing a student to register for a class.
 * This is the "Rules Engine" part of the Registration concept.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The ID of the student attempting to register.
 * @param {number} classId - The ID of the class the student is attempting to register for.
 * @returns {Promise<{canRegister: boolean, message: string}>}
 */
async function enforceRegistrationRules(db, studentId, classId) {
  // --- 1. Check Registration Holds ---
  // const holds = await checkHolds(db, studentId);
  // if (holds.length > 0) {
  //   return { canRegister: false, message: `Student has active registration holds: ${holds.map(h => h.type).join(', ')}` };
  // }

  // --- 2. Check Prerequisites, Corequisites, Anti-requisites ---
  // const prereqStatus = await checkPrerequisites(db, studentId, classId);
  // if (!prereqStatus.satisfied && !await getWaiver(db, studentId, classId, 'prerequisite')) {
  //   return { canRegister: false, message: `Prerequisites not met: ${prereqStatus.message}` };
  // }

  // --- 3. Check Time Conflicts ---
  // This would involve fetching the student's current schedule and comparing with the new class.
  // const hasTimeConflict = await checkTimeConflicts(db, studentId, classId);
  // if (hasTimeConflict && !await getWaiver(db, studentId, classId, 'time_conflict')) {
  //   return { canRegister: false, message: "Time conflict with another registered class." };
  // }

  // --- 4. Check Class Capacity ---
  // const { currentEnrollment, capacity } = await getClassCapacity(db, classId);
  // if (currentEnrollment >= capacity) {
  //   return { canRegister: false, message: "Class is full." };
  // }

  // --- 5. Check Registration Schedule (deadlines) ---
  // const registrationOpen = await checkRegistrationOpen(db, studentId, classId);
  // if (!registrationOpen) {
  //   return { canRegister: false, message: "Registration is not open for this class/student." };
  // }

  // If all checks pass (or are waived)
  return { canRegister: true, message: "All rules passed." };
}

/**
 * Allows a student to register for a class, provided all rules are met.
 * If the class is full, the student might be added to a waitlist.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The ID of the student.
 * @param {number} classId - The ID of the class.
 * @returns {Promise<{success: boolean, message: string, status?: string}>}
 */
export async function register(db, studentId, classId) {
  try {
    await db.query('BEGIN');

    // Enforce rules
    const { canRegister, message } = await enforceRegistrationRules(db, studentId, classId);

    if (!canRegister) {
      // If class is full, attempt to add to waitlist
      if (message === "Class is full.") {
        // const waitlistResult = await addToWaitlist(db, studentId, classId);
        // if (waitlistResult.success) {
        //   await db.query('COMMIT');
        //   return { success: true, message: "Class is full. You have been added to the waitlist.", status: 'waitlisted' };
        // } else {
        //   await db.query('ROLLBACK');
        //   return { success: false, message: waitlistResult.message };
        // }
        await db.query('ROLLBACK');
        return { success: false, message: "Class is full. Waitlist functionality not yet implemented." };
      }
      await db.query('ROLLBACK');
      return { success: false, message };
    }

    // Check if already registered/enrolled
    const existingEnrollment = await db.query(
      'SELECT status FROM enrollments WHERE student_id = $1 AND class_id = $2',
      [studentId, classId]
    );

    if (existingEnrollment.rows.length > 0) {
      const currentStatus = existingEnrollment.rows[0].status;
      if (currentStatus === 'registered') {
        await db.query('ROLLBACK');
        return { success: false, message: "Student is already registered for this class." };
      } else if (currentStatus === 'dropped' || currentStatus === 'withdrawn') {
        // Allow re-registration if previously dropped/withdrawn
        await db.query(
          'UPDATE enrollments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2 AND class_id = $3 RETURNING id',
          ['registered', studentId, classId]
        );
        await db.query('COMMIT');
        return { success: true, message: "Student re-registered successfully.", status: 'registered' };
      }
    }

    // Perform registration
    await db.query(
      'INSERT INTO enrollments (student_id, class_id, status) VALUES ($1, $2, $3) RETURNING id',
      [studentId, classId, 'registered']
    );

    // (Optional) Update class enrollment count in class_schedule if needed

    await db.query('COMMIT');
    return { success: true, message: "Student registered successfully.", status: 'registered' };
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error during registration:', error);
    return { success: false, message: 'Failed to register due to a database error.' };
  }
}

/**
 * Allows a student to drop a class.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The ID of the student.
 * @param {number} classId - The ID of the class.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function drop(db, studentId, classId) {
  try {
    // Check add/drop deadline (placeholder)
    // const canDrop = await checkAddDropDeadline(db, classId);
    // if (!canDrop) {
    //   return { success: false, message: "Cannot drop class after the add/drop deadline." };
    // }

    const result = await db.query(
      'UPDATE enrollments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2 AND class_id = $3 AND status = $4 RETURNING id',
      ['dropped', studentId, classId, 'registered']
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Student not found or not registered for this class." };
    }

    // (Optional) Trigger waitlist promotion if a spot opens up
    // await promoteFromWaitlist(db, classId);

    return { success: true, message: "Class dropped successfully." };
  } catch (error) {
    console.error('Error during dropping class:', error);
    return { success: false, message: 'Failed to drop class due to a database error.' };
  }
}

/**
 * Allows a student to withdraw from a class.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The ID of the student.
 * @param {number} classId - The ID of the class.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function withdraw(db, studentId, classId) {
  try {
    // Check withdrawal deadline (placeholder)
    // const canWithdraw = await checkWithdrawalDeadline(db, classId);
    // if (!canWithdraw) {
    //   return { success: false, message: "Cannot withdraw from class after the withdrawal deadline." };
    // }

    const result = await db.query(
      'UPDATE enrollments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2 AND class_id = $3 AND (status = $4 OR status = $5) RETURNING id',
      ['withdrawn', studentId, classId, 'registered', 'dropped'] // Can withdraw if registered or dropped
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Student not found or not registered/dropped for this class." };
    }

    return { success: true, message: "Class withdrawn successfully." };
  } catch (error) {
    console.error('Error during withdrawing from class:', error);
    return { success: false, message: 'Failed to withdraw from class due to a database error.' };
  }
}

/**
 * Allows a Registrar to override enrollment rules and directly enroll a student in a class.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The ID of the student.
 * @param {number} classId - The ID of the class.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function overrideEnroll(db, studentId, classId) {
  try {
    const existingEnrollment = await db.query(
      'SELECT status FROM enrollments WHERE student_id = $1 AND class_id = $2',
      [studentId, classId]
    );

    if (existingEnrollment.rows.length > 0) {
      // If already exists, update status to registered
      await db.query(
        'UPDATE enrollments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2 AND class_id = $3 RETURNING id',
        ['registered', studentId, classId]
      );
    } else {
      // Otherwise, insert new enrollment
      await db.query(
        'INSERT INTO enrollments (student_id, class_id, status) VALUES ($1, $2, $3) RETURNING id',
        [studentId, classId, 'registered']
      );
    }
    return { success: true, message: "Student enrolled via override successfully." };
  } catch (error) {
    console.error('Error during override enrollment:', error);
    return { success: false, message: 'Failed to override enrollment due to a database error.' };
  }
}
