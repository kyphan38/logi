// ============================================================
// logi - Database id trong Firebase project kyphan38-logi-app.
//
// Từ 2026-09, mỗi app có project Firebase riêng, nên logi dùng luôn
// database mặc định '(default)'. Không còn dùng chung project với
// cogi/noda, nên không cần tên database riêng nữa.
// Lý do và các bước: roadmap/PLAN-project-split-logi.md
//
// functions/ và scripts/ là package riêng, không import được file này.
// Ở đó chỉ cần gọi getFirestore() không tham số.
//
// Giữ hằng số này lại để sau còn một chỗ duy nhất mà đổi nếu cần.
// ============================================================
export const DB_ID = '(default)';
