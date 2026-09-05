import { describe, it, expect } from "vitest";
import { browserOf } from "./marks";

/**
 * The ordering in `browserOf` is the only thing standing between a device list
 * and a page where every row wears Chrome's mark: every Chromium browser
 * carries "Chrome" and Chrome itself carries "Safari", so a rule that tests
 * either one early swallows the browser it was meant to name. That is the bug
 * these cases exist to catch — reorder the checks and they fail.
 *
 * Both shapes are tested, because both reach the component: the server's
 * parsed label ("Edge 140") on a stored row, and a raw agent anywhere the
 * label has not been through the parser.
 */
describe("browserOf", () => {
  it("reads the server's label", () => {
    expect(browserOf("Chrome 140")).toBe("chrome");
    expect(browserOf("Edge 140")).toBe("edge");
    expect(browserOf("Brave 131")).toBe("brave");
    expect(browserOf("Opera 124")).toBe("opera");
    expect(browserOf("Vivaldi 7")).toBe("vivaldi");
    expect(browserOf("Yandex Browser 25")).toBe("yandex");
    expect(browserOf("DuckDuckGo 7")).toBe("duckduckgo");
    expect(browserOf("Firefox 131")).toBe("firefox");
    expect(browserOf("Safari 18")).toBe("safari");
    expect(browserOf("Internet Explorer 11")).toBe("ie");
    /* "Samsung Internet" contains the whole of "Internet", so it has to be
       named before Internet Explorer is looked for. */
    expect(browserOf("Samsung Internet 25")).toBe("samsung");
  });

  it("reads a raw agent, and is not fooled by the Chrome every Chromium claims", () => {
    const chromium = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    expect(browserOf(`${chromium} Edg/140.0.3485.66`)).toBe("edge");
    expect(browserOf(`${chromium} OPR/124.0.0.0`)).toBe("opera");
    expect(browserOf(`${chromium} Vivaldi/7.5.3735.54`)).toBe("vivaldi");
    expect(browserOf(chromium)).toBe("chrome");
    expect(browserOf("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toBe("safari");
  });

  it("falls back to the neutral globe rather than a wrong logo", () => {
    expect(browserOf("UC Browser 13")).toBe("other");
    expect(browserOf(null)).toBe("other");
    expect(browserOf("")).toBe("other");
  });
});
