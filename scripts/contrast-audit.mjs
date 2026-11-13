const routes = [
  "today",
  "habits",
  "calendar",
  "study",
  "flashcards",
  "class-schedule",
  "workout",
  "learning",
  "journal",
  "insights",
];

const modes = [
  { name: "light", dark: false, highContrast: false, colorScheme: "light" },
  { name: "dark", dark: true, highContrast: false, colorScheme: "dark" },
  {
    name: "high-contrast",
    dark: false,
    highContrast: true,
    colorScheme: "light",
  },
];

const viewports = [
  { width: 390, height: 844 },
  { width: 1360, height: 900 },
];

const accents = [
  { name: "default violet", value: "#9a5de8" },
  { name: "blue", value: "#287d9b" },
  { name: "green", value: "#26866b" },
  { name: "orange", value: "#d97706" },
  { name: "pink", value: "#c34b72" },
  { name: "gray", value: "#6b7280" },
];

const baseUrl =
  process.env.DAYMARK_BASE_URL || "http://127.0.0.1:5173/";

async function loadChromium() {
  for (const packageName of ["playwright", "playwright-core"]) {
    try {
      return (await import(packageName)).chromium;
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error(
    "Playwright is not installed in this project environment. Make it available to Node without adding it to package.json, then rerun npm run audit:contrast.",
  );
}

function getContrastAudit() {
  const colorPattern = /color\(srgb\s+[^)]+\)|rgba?\([^)]+\)/gi;

  function parseColor(value) {
    if (!value) return null;
    const text = value.trim().toLowerCase();
    if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

    let channels;
    let alpha = 1;
    if (text.startsWith("color(srgb")) {
      const body = text.slice(text.indexOf(" ") + 1, -1);
      const parts = body.split("/");
      channels = parts[0].trim().split(/\s+/).map(Number);
      if (parts[1]) alpha = Number(parts[1].trim());
    } else {
      const body = text.slice(text.indexOf("(") + 1, -1);
      const parts = body.split("/");
      const channelText = parts[0].replace(/,/g, " ").trim();
      channels = channelText.split(/\s+/).map((part) => {
        if (part.endsWith("%")) return (Number.parseFloat(part) / 100) * 255;
        return Number.parseFloat(part);
      });
      if (parts[1]) alpha = Number.parseFloat(parts[1].trim());
      else if (channels.length > 3) alpha = channels.pop();
    }
    if (channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) {
      return null;
    }
    return {
      r: channels[0] / (channels[0] > 1 ? 255 : 1),
      g: channels[1] / (channels[1] > 1 ? 255 : 1),
      b: channels[2] / (channels[2] > 1 ? 255 : 1),
      a: Math.max(0, Math.min(1, alpha)),
    };
  }

  function colorsIn(value) {
    return [...(value || "").matchAll(colorPattern)]
      .map((match) => parseColor(match[0]))
      .filter(Boolean);
  }

  function composite(foreground, background, opacity = 1) {
    const alpha = foreground.a * opacity;
    const outAlpha = alpha + background.a * (1 - alpha);
    if (!outAlpha) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r:
        (foreground.r * alpha + background.r * background.a * (1 - alpha)) /
        outAlpha,
      g:
        (foreground.g * alpha + background.g * background.a * (1 - alpha)) /
        outAlpha,
      b:
        (foreground.b * alpha + background.b * background.a * (1 - alpha)) /
        outAlpha,
      a: outAlpha,
    };
  }

  function channel(value) {
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  }

  function luminance(color) {
    return (
      0.2126 * channel(color.r) +
      0.7152 * channel(color.g) +
      0.0722 * channel(color.b)
    );
  }

  function ratio(first, second) {
    const [lighter, darker] = [luminance(first), luminance(second)].sort(
      (a, b) => b - a,
    );
    return (lighter + 0.05) / (darker + 0.05);
  }

  function isVisible(element) {
    if (!element.getClientRects().length) return false;
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
    }
    return true;
  }

  function backgroundsFor(element, fallback) {
    let candidates = [fallback];
    const chain = [];
    for (let current = element; current; current = current.parentElement) {
      chain.push(current);
    }

    for (const current of chain.reverse()) {
      const style = getComputedStyle(current);
      const opacity = Number(style.opacity);
      const base = parseColor(style.backgroundColor);
      if (base) {
        candidates = candidates.map((background) =>
          composite(base, background, opacity),
        );
      }
      const stops = colorsIn(style.backgroundImage);
      if (stops.length) {
        const behind = candidates;
        candidates = [
          ...behind,
          ...stops.flatMap((stop) =>
            behind.map((background) => composite(stop, background, opacity)),
          ),
        ];
      }
      if (candidates.length > 24) candidates = candidates.slice(-24);
    }
    return candidates.map((color) =>
      color.a < 1 ? composite(color, fallback) : color,
    );
  }

  function audit() {
    const dark = document.documentElement.classList.contains("dark-mode");
    const highContrast = document.documentElement.classList.contains(
      "high-contrast",
    );
    const fallback = parseColor(
      dark ? (highContrast ? "rgb(0 0 0)" : "rgb(23 20 30)") : "rgb(255 255 255)",
    );
    const issues = [];
    let textChecks = 0;
    let nonTextChecks = 0;

    for (const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    ); walker.nextNode(); ) {
      const node = walker.currentNode;
      const text = node.nodeValue.replace(/\s+/g, " ").trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
      const element = node.parentElement;
      if (!element || !isVisible(element)) continue;

      const style = getComputedStyle(element);
      const color = colorsIn(style.color)[0];
      if (!color) continue;

      let opacity = color.a;
      for (let current = element; current; current = current.parentElement) {
        opacity *= Number(getComputedStyle(current).opacity);
      }
      const foreground = { ...color, a: opacity };
      const backgrounds = backgroundsFor(element, fallback);
      const minimum = Number.parseFloat(style.fontSize) >= 24 ||
        (Number.parseFloat(style.fontSize) >= 18.66 &&
          Number.parseInt(style.fontWeight, 10) >= 700)
        ? 3
        : 4.5;
      textChecks += 1;
      const worst = Math.min(
        ...backgrounds.map((background) =>
          ratio(composite(foreground, background), background),
        ),
      );
      if (worst + 0.01 < minimum) {
        issues.push({
          kind: "text",
          text: text.slice(0, 100),
          selector: `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.trim().replace(/\s+/g, ".")}` : ""}`,
          ratio: worst,
          required: minimum,
        });
      }
    }

    const visibleControls = document.querySelectorAll(
      "button, input, select, textarea, summary, [role=button], [role=checkbox]",
    );
    for (const element of visibleControls) {
      if (!isVisible(element)) continue;
      const style = getComputedStyle(element);
      const border = colorsIn(style.borderTopColor)[0];
      const hasBorder =
        style.borderTopStyle !== "none" &&
        Number.parseFloat(style.borderTopWidth) >= 1;
      if (border && hasBorder) {
        const backgrounds = backgroundsFor(element, fallback);
        const worst = Math.min(...backgrounds.map((background) => ratio(border, background)));
        nonTextChecks += 1;
        if (worst < 3) {
          issues.push({
            kind: "control border",
            text: element.getAttribute("aria-label") || element.innerText || element.tagName,
            selector: element.tagName.toLowerCase(),
            ratio: worst,
            required: 3,
          });
        }
      }

      if (element.matches("input, textarea") && element.placeholder) {
        const placeholder = colorsIn(
          getComputedStyle(element, "::placeholder").color,
        )[0];
        if (placeholder) {
          const worst = Math.min(
            ...backgroundsFor(element, fallback).map((background) =>
              ratio(placeholder, background),
            ),
          );
          nonTextChecks += 1;
          if (worst < 4.5) {
            issues.push({
              kind: "placeholder",
              text: element.placeholder,
              selector: element.tagName.toLowerCase(),
              ratio: worst,
              required: 4.5,
            });
          }
        }
      }
    }

    for (const track of document.querySelectorAll(
      ".progress-track, .learning-progress-track, [role=progressbar]",
    )) {
      if (!isVisible(track)) continue;
      const trackColor = colorsIn(getComputedStyle(track).backgroundColor)[0];
      const fill = track.querySelector("span, i") || track;
      const fillColor = colorsIn(getComputedStyle(fill).backgroundColor)[0];
      if (!trackColor || !fillColor) continue;
      const fillRatio = ratio(fillColor, trackColor);
      nonTextChecks += 1;
      if (fillRatio < 3) {
        issues.push({
          kind: "progress fill",
          text: track.className?.toString() || "progress",
          selector: track.tagName.toLowerCase(),
          ratio: fillRatio,
          required: 3,
        });
      }
    }

    return { textChecks, nonTextChecks, issues };
  }

  return audit();
}

async function run() {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: viewports[0] });
  const failures = [];
  let textChecks = 0;
  let nonTextChecks = 0;

  try {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.setItem("daymark-onboarded", "true");
      localStorage.removeItem("daymark-onboarding-pending");
      localStorage.removeItem("daymark-state");
      localStorage.setItem("daymark-dark", "false");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".shell").waitFor({ state: "visible", timeout: 15000 });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => {
      localStorage.removeItem("daymark-dark");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".shell").waitFor({ state: "visible", timeout: 15000 });
    const firstVisitDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark-mode"),
    );
    if (!firstVisitDark) {
      failures.push({
        kind: "system preference",
        text: "First visit did not respect prefers-color-scheme: dark",
      });
    }

    await page.evaluate(() => localStorage.setItem("daymark-dark", "false"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".shell").waitFor({ state: "visible", timeout: 15000 });
    const manualLight = await page.evaluate(
      () => !document.documentElement.classList.contains("dark-mode"),
    );
    if (!manualLight) {
      failures.push({
        kind: "manual theme preference",
        text: "Saved light-mode preference did not override system dark mode",
      });
    }

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const accent of accents) {
        for (const mode of modes) {
          await page.emulateMedia({ colorScheme: mode.colorScheme });
          await page.evaluate(({ accentValue, dark, highContrast }) => {
            const root = document.documentElement;
            root.classList.toggle("dark-mode", dark);
            root.classList.toggle("high-contrast", highContrast);
            root.style.setProperty("--theme-accent", accentValue);
          }, {
            accentValue: accent.value,
            dark: mode.dark,
            highContrast: mode.highContrast,
          });

          for (const route of routes) {
            await page.evaluate(
              (hash) => {
                window.location.hash = hash;
              },
              `#${route}`,
            );
            await page.waitForTimeout(80);
            const result = await page.evaluate(getContrastAudit);
            textChecks += result.textChecks;
            nonTextChecks += result.nonTextChecks;
            failures.push(
              ...result.issues.map((issue) => ({
                ...issue,
                route,
                mode: mode.name,
                viewport: `${viewport.width}x${viewport.height}`,
                accent: accent.name,
              })),
            );
          }

          if (accent === accents[0]) {
            await page.evaluate(() => {
              window.location.hash = "#habits";
            });
            await page.waitForTimeout(80);
            const habitRow = page.locator("#habits .habit-row").first();
            if (await habitRow.count()) await habitRow.click();
            const editButton = page.getByRole("button", {
              name: "Edit habit",
              exact: true,
            });
            if (await editButton.isVisible().catch(() => false)) {
              await editButton.click();
              await page.waitForTimeout(80);
              const editResult = await page.evaluate(getContrastAudit);
              textChecks += editResult.textChecks;
              nonTextChecks += editResult.nonTextChecks;
              failures.push(
                ...editResult.issues.map((issue) => ({
                  ...issue,
                  route: "habits (edit dialog)",
                  mode: mode.name,
                  viewport: `${viewport.width}x${viewport.height}`,
                  accent: accent.name,
                })),
              );
              await page.getByRole("button", { name: "Close edit habit dialog" }).click();
            } else {
              failures.push({
                kind: "audit setup",
                text: "Could not open Edit habit dialog",
                route: "habits",
                mode: mode.name,
                viewport: `${viewport.width}x${viewport.height}`,
                accent: accent.name,
              });
            }

            if (viewport.width <= 700) {
              const more = page.locator(
                ".mobile-nav button[aria-label*='More'], .mobile-nav button",
              ).filter({ hasText: /more/i }).first();
              if (await more.isVisible().catch(() => false)) await more.click();
            } else {
              const accountMenu = page.locator(".sidebar-account-menu > summary");
              if (await accountMenu.isVisible().catch(() => false)) {
                await accountMenu.click();
              }
            }
            const editProfile = page.getByRole("button", {
              name: "Edit profile",
              exact: true,
            });
            if (await editProfile.isVisible().catch(() => false)) {
              await editProfile.click();
              await page.waitForTimeout(80);
              const profileResult = await page.evaluate(getContrastAudit);
              textChecks += profileResult.textChecks;
              nonTextChecks += profileResult.nonTextChecks;
              failures.push(
                ...profileResult.issues.map((issue) => ({
                  ...issue,
                  route: "habits (profile dialog)",
                  mode: mode.name,
                  viewport: `${viewport.width}x${viewport.height}`,
                  accent: accent.name,
                })),
              );
              await page.getByRole("button", { name: "Save profile" }).click();
              await page.locator(".toast").waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
              const toastResult = await page.evaluate(getContrastAudit);
              textChecks += toastResult.textChecks;
              nonTextChecks += toastResult.nonTextChecks;
              failures.push(
                ...toastResult.issues.map((issue) => ({
                  ...issue,
                  route: "habits (toast)",
                  mode: mode.name,
                  viewport: `${viewport.width}x${viewport.height}`,
                  accent: accent.name,
                })),
              );
            } else {
              failures.push({
                kind: "audit setup",
                text: "Could not open profile dialog",
                route: "habits",
                mode: mode.name,
                viewport: `${viewport.width}x${viewport.height}`,
                accent: accent.name,
              });
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `Audited ${textChecks} visible text nodes and ${nonTextChecks} non-text UI checks across ${routes.length} routes, ${modes.length} modes, ${viewports.length} viewports, and ${accents.length} accents.`,
  );
  if (failures.length) {
    console.error(`Found ${failures.length} contrast/audit setup issue(s):`);
    for (const issue of failures) {
      const ratioText =
        typeof issue.ratio === "number" ? `${issue.ratio.toFixed(2)}:1` : "";
      console.error(
        `- [${issue.kind}] ${issue.route || ""} / ${issue.mode || ""} / ${issue.viewport || ""} / ${issue.accent || ""}: ${JSON.stringify(issue.text)} ${ratioText}${issue.required ? ` (requires ${issue.required}:1)` : ""}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log("All measured contrast checks passed.");
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
