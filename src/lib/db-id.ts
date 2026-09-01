// ============================================================
// logi - Database id trong Firebase project kyphan38-apps.
//
// Ba app dùng chung project: cogi → 'cogi-db', logi → 'logi-db',
// noda → 'noda-db'. Mỗi database có bộ rules riêng, nên deploy rules
// của app này không xoá rules của app kia nữa.
// Lý do và các bước: roadmap/PLAN-db-split.md
//
// functions/ và scripts/ là package riêng, không import được file này,
// nên ở đó chuỗi 'logi-db' được ghi thẳng kèm comment trỏ về đây.
// ============================================================
export const DB_ID = 'logi-db';
