/**
 * 利用規約・プライバシーポリシーの版（Issue #64）。
 *
 * 本文（components/LegalDocuments.tsx）を改めたら、ここの版を新しくする。
 * 版が変わると、参加者と酒蔵にもう一度同意を求める（consents 表に版ごとに残す）。
 * 誤字の直しなど、中身が変わらない修正では上げなくてよい。
 */
export const LEGAL_VERSION = '2026-09-22';

/** 本文の末尾に出す、制定・改定の日付。 */
export const LEGAL_EFFECTIVE_DATE = '2026年9月22日';
