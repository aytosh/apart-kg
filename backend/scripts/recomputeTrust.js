import { prisma } from "../src/prisma.js";
import { auditListing } from "../src/services/trust.js";
import { parseImages } from "../src/utils/images.js";

const force = process.argv.includes("--force");

async function main() {
  const where = force ? {} : { trustFlags: null };
  const listings = await prisma.listing.findMany({
    where,
    select: { id: true, images: true },
  });
  console.log(`[trust] auditing ${listings.length} listings (force=${force})...`);
  let done = 0;
  for (const l of listings) {
    const imgs = parseImages(l.images);
    try {
      await auditListing(l.id, { imagePaths: imgs });
      done++;
      if (done % 25 === 0) console.log(`  processed ${done}/${listings.length}`);
    } catch (err) {
      console.error("  failed", l.id, err?.message);
    }
  }
  console.log(`[trust] done. processed=${done}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
