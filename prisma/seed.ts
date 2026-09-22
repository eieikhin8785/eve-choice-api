import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const images = [
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85",
];

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.viewingRequest.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.savedListing.deleteMany();
  await prisma.listingAmenity.deleteMany();
  await prisma.listingMedia.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.propertyCategory.deleteMany();
  await prisma.location.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();

  const roleData = [
    ["buyer_renter", "Buyer / Renter"],
    ["owner", "Owner"],
    ["agent", "Agent"],
    ["staff", "Staff"],
    ["admin", "Admin"],
  ] as const;
  const roles = Object.fromEntries(await Promise.all(roleData.map(async ([key, label]) => [key, await prisma.role.create({ data: { key, label } })])));

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.create({ data: { email: "demo@fairwayproperty.com", name: "Maya Lin", passwordHash, phone: "+95 9 420 555 018" } });
  const agent = await prisma.user.create({ data: { email: "agent@fairwayproperty.com", name: "Thura Properties", passwordHash, phone: "+95 9 760 111 222" } });
  const staff = await prisma.user.create({ data: { email: "staff@fairwayproperty.com", name: "Fairway Staff", passwordHash, emailVerifiedAt: new Date() } });
  await prisma.userRole.createMany({ data: [
    { userId: user.id, roleId: roles.buyer_renter.id }, { userId: user.id, roleId: roles.owner.id },
    { userId: agent.id, roleId: roles.buyer_renter.id }, { userId: agent.id, roleId: roles.agent.id },
    { userId: staff.id, roleId: roles.staff.id }, { userId: staff.id, roleId: roles.admin.id },
  ] });

  const cities = await Promise.all([
    prisma.location.create({ data: { name: "Yangon", slug: "yangon", type: "CITY", sortOrder: 1 } }),
    prisma.location.create({ data: { name: "Mandalay", slug: "mandalay", type: "CITY", sortOrder: 2 } }),
  ]);
  const townshipNames = ["Bahan", "Dagon", "Insein", "Hlaing", "Mayangone", "Chanayethazan", "Maha Aung Myay", "Chanmyathazi"];
  const townships = await Promise.all(townshipNames.map((name, index) => prisma.location.create({ data: { name: name + (index > 4 ? " Township" : ""), slug: name.toLowerCase().replaceAll(" ", "-"), type: "TOWNSHIP", parentId: cities[index > 4 ? 1 : 0].id, sortOrder: index } })));

  const categoryNames = ["Land", "Apartment / Condo", "House", "Room", "Commercial Property", "Building", "Other"];
  const categories = await Promise.all(categoryNames.map((name, index) => prisma.propertyCategory.create({ data: { name, slug: name.toLowerCase().replaceAll(" / ", "-").replaceAll(" ", "-"), sortOrder: index } })));
  const amenityNames = ["Car parking", "24/7 security", "Generator", "Air conditioning", "Elevator", "Near main road", "Water supply", "Furnished"];
  const amenities = await Promise.all(amenityNames.map((name) => prisma.amenity.create({ data: { name, slug: name.toLowerCase().replaceAll(" ", "-").replaceAll("/", "") } })));

  const listingData = [
    { title: "Sunlit 3BR residence near Inya Lake", mode: "SALE" as const, price: 520000000, category: 2, location: 3, area: 2150, beds: 3, baths: 3, furnishing: "FULLY_FURNISHED" as const, status: "PUBLISHED" as const, image: 0, desc: "A calm, generous family home with leafy views, generous entertaining space, and a quick drive to the city’s best schools." },
    { title: "Modern serviced apartment in Bahan", mode: "RENT" as const, price: 2800000, category: 1, location: 0, area: 1250, beds: 2, baths: 2, furnishing: "FULLY_FURNISHED" as const, status: "PUBLISHED" as const, image: 1, desc: "Move-in ready apartment with an airy living room, concierge service, and easy access to cafés and hospitals." },
    { title: "Quiet corner land in Dagon", mode: "SALE" as const, price: 780000000, category: 0, location: 1, area: 4800, beds: null, baths: null, furnishing: null, status: "PUBLISHED" as const, image: 2, desc: "A rare residential plot in a peaceful, established neighborhood with a wide road frontage." },
    { title: "Renovated townhouse with garden", mode: "SALE" as const, price: 385000000, category: 2, location: 2, area: 1800, beds: 4, baths: 3, furnishing: "PARTLY_FURNISHED" as const, status: "PUBLISHED" as const, image: 3, desc: "Thoughtfully refreshed townhouse with a private garden, natural light, and room for a growing family." },
    { title: "Golden Valley executive rental", mode: "RENT" as const, price: 4500000, category: 1, location: 4, area: 1750, beds: 3, baths: 3, furnishing: "FULLY_FURNISHED" as const, status: "PUBLISHED" as const, image: 4, desc: "An elegant, fully furnished home for long-stay professionals, with parking and dependable power." },
    { title: "Mandalay central family home", mode: "SALE" as const, price: 295000000, category: 2, location: 6, area: 2400, beds: 4, baths: 3, furnishing: "UNFURNISHED" as const, status: "PUBLISHED" as const, image: 5, desc: "Spacious home close to central Mandalay amenities, with a flexible layout and excellent neighborhood access." },
    { title: "Small office near 78th Street", mode: "RENT" as const, price: 1800000, category: 4, location: 7, area: 950, beds: null, baths: 1, furnishing: "PARTLY_FURNISHED" as const, status: "PUBLISHED" as const, image: 2, desc: "Bright, practical office floor for a small team, close to transport and everyday services." },
    { title: "Looking for 2BR rental in Yangon", mode: "WANTED" as const, price: 1800000, category: 1, location: 0, area: 1100, beds: 2, baths: 2, furnishing: "FULLY_FURNISHED" as const, status: "PUBLISHED" as const, image: 1, desc: "Professional couple seeking a well-maintained furnished apartment with reliable parking." },
    { title: "New listing awaiting review", mode: "SALE" as const, price: 410000000, category: 5, location: 5, area: 6200, beds: null, baths: 4, furnishing: null, status: "PENDING_REVIEW" as const, image: 4, desc: "A substantial multi-use building with an adaptable floor plan." },
  ];

  const listings = [];
  for (let i = 0; i < listingData.length; i++) {
    const item = listingData[i];
    const listing = await prisma.listing.create({ data: {
      slug: item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + (i + 1),
      title: item.title, description: item.desc, mode: item.mode, status: item.status, price: item.price, negotiable: i % 3 === 0,
      rentalPeriod: item.mode === "RENT" ? "monthly" : null, floorArea: item.area, areaUnit: "sqft", bedrooms: item.beds, bathrooms: item.baths,
      furnishing: item.furnishing, addressLine: i > 4 ? "Mandalay, Myanmar" : "Yangon, Myanmar", landmark: i % 2 ? "Near main road" : "Quiet neighborhood",
      latitude: i > 4 ? 21.9588 + i * .001 : 16.8409 + i * .001, longitude: i > 4 ? 96.0891 + i * .001 : 96.1735 + i * .001,
      locationId: townships[item.location].id, categoryId: categories[item.category].id, createdById: i % 3 === 0 ? user.id : agent.id,
      assignedAgentId: agent.id, submittedAt: new Date(), publishedAt: item.status === "PUBLISHED" ? new Date(Date.now() - i * 86400000) : null,
      media: { create: [{ url: images[item.image], altText: item.title, isCover: true, sortOrder: 0 }, { url: images[(item.image + 1) % images.length], altText: "Interior view", sortOrder: 1 }] },
      amenities: { create: amenities.slice(i % 3, i % 3 + 4).map((amenity) => ({ amenityId: amenity.id })) },
    } });
    listings.push(listing);
  }

  await prisma.savedListing.createMany({ data: [{ userId: user.id, listingId: listings[0].id }, { userId: user.id, listingId: listings[1].id }] });
  await prisma.inquiry.create({ data: { listingId: listings[0].id, senderId: user.id, recipientId: agent.id, message: "I would love to arrange a viewing this weekend.", phone: user.phone } });
  await prisma.viewingRequest.create({ data: { listingId: listings[1].id, requesterId: user.id, requestedDate: new Date(Date.now() + 3 * 86400000), message: "Saturday afternoon would be ideal." } });
  await prisma.report.create({ data: { listingId: listings[3].id, reporterId: user.id, reason: "OUTDATED_INFORMATION", details: "Please confirm the availability date." } });
  await prisma.notification.create({ data: { userId: user.id, type: "LISTING_MATCH", title: "New homes in Bahan", body: "Three new properties match your saved search." } });
  await prisma.auditLog.createMany({ data: listings.map((listing) => ({ actorId: staff.id, entityType: "Listing", entityId: listing.id, action: listing.status === "PUBLISHED" ? "APPROVED" : "SUBMITTED", metadata: JSON.stringify({ seeded: true }) })) });
  console.log(`Seeded ${listings.length} listings, ${townships.length} townships, and demo users.`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

