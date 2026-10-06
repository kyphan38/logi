// ============================================================
// logi - Database id in the Firebase project kyphan38-logi-app.
//
// Since 2026-09 each app has its own Firebase project, so logi uses the
// default database '(default)'. It no longer shares a project with
// cogi/noda, so no named database is needed.
// Why and how: roadmap/PLAN-project-split-logi.md
//
// functions/ and scripts/ are separate packages and cannot import this file.
// There, just call getFirestore() with no arguments.
//
// Kept as a constant so there is one place to change it if needed.
// ============================================================
export const DB_ID = '(default)';
