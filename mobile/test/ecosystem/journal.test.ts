import {
  normalizeJournal,
  normalizeJournalDay,
  normalizeJournalRun,
} from "../../src/ecosystem/journal";

test("normalizeJournal drops bad rows and keeps a safe hour", () => {
  expect(
    normalizeJournal({
      enabled: true,
      hour: 21,
      days: ["2026-10-16", "nope", 3, "2026-10-15"],
    }),
  ).toEqual({ enabled: true, hour: 21, days: ["2026-10-16", "2026-10-15"] });
  expect(normalizeJournal({ enabled: "yes", hour: 24, days: "2026-10-16" })).toEqual({
    enabled: false,
    hour: 22,
    days: [],
  });
  expect(normalizeJournal(null)).toEqual({ enabled: false, hour: 22, days: [] });
});

test("normalizeJournalDay and normalizeJournalRun keep only real fields", () => {
  expect(normalizeJournalDay({ date: "2026-10-16", text: "Decided two disks." })).toEqual({
    date: "2026-10-16",
    text: "Decided two disks.",
  });
  expect(normalizeJournalDay({ date: "tuesday", text: 1 })).toEqual({ date: "", text: "" });
  expect(normalizeJournalRun({ date: "2026-10-16", written: false })).toEqual({
    date: "2026-10-16",
    written: false,
  });
  expect(normalizeJournalRun({ written: "yes" })).toEqual({ date: "", written: false });
});
