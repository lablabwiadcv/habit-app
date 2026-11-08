const CLASSROOM_API = "https://classroom.googleapis.com/v1";
const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
];

let identityServicesPromise;

function loadIdentityServices() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (identityServicesPromise) return identityServicesPromise;

  identityServicesPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        identityServicesPromise = null;
        reject(new Error("Google sign-in could not be initialized."));
      }
    };
    script.onerror = () => {
      identityServicesPromise = null;
      reject(new Error("Could not load Google sign-in. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });

  return identityServicesPromise;
}

export function prepareGoogleIdentityServices() {
  return loadIdentityServices();
}

export async function requestClassroomAccessToken(clientId) {
  if (!clientId) {
    throw new Error(
      "Google Classroom is not configured. Add the OAuth client ID and restart Daymark.",
    );
  }

  await loadIdentityServices();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: CLASSROOM_SCOPES.join(" "),
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description ||
                `Google authorization failed: ${response.error}`,
            ),
          );
          return;
        }
        if (!response.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(
          new Error(
            error.message ||
              "Google authorization was closed or could not be opened.",
          ),
        );
      },
    });
    tokenClient.requestAccessToken();
  });
}

async function fetchCollection(
  accessToken,
  path,
  collectionName,
  fields,
  params = {},
) {
  const items = [];
  let pageToken = "";

  do {
    const url = new URL(`${CLASSROOM_API}/${path}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set(
      "fields",
      `nextPageToken,${collectionName}(${fields})`,
    );
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
          `Google Classroom request failed (${response.status}).`,
      );
    }

    if (Array.isArray(payload?.[collectionName])) {
      items.push(...payload[collectionName]);
    }
    pageToken = payload?.nextPageToken || "";
  } while (pageToken);

  return items;
}

function formatDueDate(dueDate) {
  if (!dueDate) return "";
  const { year, month, day } = dueDate;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function fetchClassroomAssignments(accessToken) {
  const courses = await fetchCollection(
    accessToken,
    "courses",
    "courses",
    "id,name",
    { courseStates: "ACTIVE" },
  );
  const assignmentsByCourse = await Promise.all(
    courses.map(async (course) => {
      if (!course?.id) return [];
      const coursework = await fetchCollection(
        accessToken,
        `courses/${encodeURIComponent(course.id)}/courseWork`,
        "courseWork",
        "id,title,dueDate,alternateLink",
        { courseWorkStates: "PUBLISHED" },
      );
      return coursework
        .filter((item) => item?.id && String(item.title || "").trim())
        .map((item) => ({
          id: `classroom-${course.id}-${item.id}`,
          title: String(item.title).trim(),
          type: "assignment",
          subject: String(course.name || "Google Classroom"),
          due: formatDueDate(item.dueDate),
          priority: "medium",
          done: false,
          source: "google-classroom",
          sourceUrl: String(item.alternateLink || ""),
        }));
    }),
  );
  return assignmentsByCourse.flat();
}

export function mergeClassroomAssignments(existingTasks, classroomAssignments) {
  const incomingById = new Map(
    classroomAssignments.map((assignment) => [assignment.id, assignment]),
  );
  const seenAssignmentIds = new Set();
  const mergedTasks = [];
  for (const task of existingTasks) {
    const incoming = incomingById.get(task.id);
    if (!incoming) {
      mergedTasks.push(task);
      continue;
    }
    if (seenAssignmentIds.has(task.id)) continue;
    seenAssignmentIds.add(task.id);
    incomingById.delete(task.id);
    mergedTasks.push({
      ...task,
      ...incoming,
      done: Boolean(task.done || incoming.done),
    });
  }
  return [...mergedTasks, ...incomingById.values()];
}
