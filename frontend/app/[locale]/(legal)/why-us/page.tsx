import { generatePageMetadata, getPageContent, DefaultPage } from "../components/default-page";

/**
 * Why Us.
 *
 * The nav has carried this item since the header rework, pointing at a homepage
 * section that has now been removed — a link to nothing. It is a real page
 * instead, on the same CMS-backed mechanism as About, Terms and Privacy: the
 * content is edited in the admin rather than written into the bundle, which is
 * the only honest way to publish claims about the business. Until something is
 * written it renders the empty-state message these pages already have, which is
 * a page awaiting copy rather than a broken link.
 */
export async function generateMetadata() {
  return generatePageMetadata(
    "why-us",
    "Why Us",
    "What this platform does differently."
  );
}

export default async function WhyUs() {
  const pageContent = await getPageContent("why-us");

  return <DefaultPage pageContent={pageContent} showEmptyMessage={true} />;
}
