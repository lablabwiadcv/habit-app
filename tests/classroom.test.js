import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchClassroomAssignments,
  mergeClassroomAssignments,
} from "../src/classroom.js";

test("Classroom sync imports published coursework with course and due-date details", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname === "/v1/courses") {
      return Response.json({
        courses: [{ id: "course-1", name: "Biology" }],
      });
    }
    if (url.pathname === "/v1/courses/course-1/courseWork") {
      return Response.json({
        courseWork: [
          {
            id: "work-1",
            title: "Lab report",
            dueDate: { year: 2026, month: 11, day: 12 },
            alternateLink: "https://classroom.google.com/c/course-1/a/work-1",
          },
          { id: "work-2", title: "No due date" },
          { id: "work-3", title: "Invalid due date", dueDate: { year: 2026, month: 2, day: 31 } },
          { id: "work-4", title: "  " },
        ],
      });
    }
    throw new Error(`Unexpected Classroom endpoint: ${url.pathname}`);
  };

  try {
    const assignments = await fetchClassroomAssignments("test-access-token");
    assert.deepEqual(
      assignments.map(({ id, title, subject, due, source }) => ({
        id,
        title,
        subject,
        due,
        source,
      })),
      [
        {
          id: "classroom-course-1-work-1",
          title: "Lab report",
          subject: "Biology",
          due: "2026-11-12",
          source: "google-classroom",
        },
        {
          id: "classroom-course-1-work-2",
          title: "No due date",
          subject: "Biology",
          due: "",
          source: "google-classroom",
        },
        {
          id: "classroom-course-1-work-3",
          title: "Invalid due date",
          subject: "Biology",
          due: "",
          source: "google-classroom",
        },
      ],
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[0].searchParams.get("courseStates"), "ACTIVE");
    assert.equal(requests[1].searchParams.get("courseWorkStates"), "PUBLISHED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Classroom sync paginates API results and surfaces request failures", async () => {
  const originalFetch = globalThis.fetch;
  let page = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/v1/courses") {
      page += 1;
      return Response.json(
        page === 1
          ? {
              courses: [{ id: "course-1", name: "Biology" }],
              nextPageToken: "next",
            }
          : { courses: [{ id: "course-2", name: "History" }] },
      );
    }
    return Response.json(
      { error: { message: "Classroom access was denied." } },
      { status: 403 },
    );
  };

  try {
    await assert.rejects(
      fetchClassroomAssignments("test-access-token"),
      /Classroom access was denied/,
    );
    assert.equal(page, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Classroom assignment merge updates imports without duplicates or lost completion", () => {
  const existing = [
    { id: "manual", title: "Manual task", type: "task" },
    {
      id: "classroom-course-1-work-1",
      title: "Old title",
      type: "assignment",
      done: true,
    },
  ];
  const incoming = [
    {
      id: "classroom-course-1-work-1",
      title: "Updated title",
      type: "assignment",
      done: false,
      source: "google-classroom",
    },
    {
      id: "classroom-course-1-work-2",
      title: "New assignment",
      type: "assignment",
      done: false,
      source: "google-classroom",
    },
  ];

  const merged = mergeClassroomAssignments(existing, incoming);
  assert.equal(merged.length, 3);
  assert.equal(merged[0], existing[0]);
  assert.equal(merged[1].title, "Updated title");
  assert.equal(merged[1].done, true);
  assert.equal(merged[2].id, "classroom-course-1-work-2");
});
