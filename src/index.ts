import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? "development-secret";
app.use(cors());
app.use(express.json({ limit: "2mb" }));

type AuthRequest = Request & { user?: { id: string; roles: string[] } };
const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
  try {
    const payload = jwt.verify(token, jwtSecret) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { roles: { include: { role: true } } } });
    if (!user || user.status === "DISABLED") return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Your session is no longer active." } });
    req.user = { id: user.id, roles: user.roles.map(({ role }) => role.key) };
    next();
  } catch { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired session." } }); }
};
const requireRole = (...allowed: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !allowed.some((role) => req.user!.roles.includes(role))) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission for this action." } });
  next();
};
const publicListingInclude = { location: { include: { parent: true } }, category: true, media: { where: { status: "READY" as const }, orderBy: { sortOrder: "asc" as const } }, amenities: { include: { amenity: true } }, assignedAgent: { select: { id: true, name: true, phone: true } } };
const listingResponse = (listing: any) => ({ ...listing, priceLabel: listing.price ? new Intl.NumberFormat("en-US").format(listing.price) + " MMK" : "Price on request", location: listing.location?.parent ? `${listing.location.parent.name}, ${listing.location.name}` : listing.location?.name, category: listing.category?.name, coverImage: listing.media?.find((media: any) => media.isCover)?.url ?? listing.media?.[0]?.url ?? null, amenities: listing.amenities?.map((item: any) => item.amenity.name) ?? [] });

app.get("/api/v1/health", (_req, res) => res.json({ status: "ok", service: "property-portal-api" }));
app.get("/api/v1/locations", async (_req, res, next) => { try { res.json(await prisma.location.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { sortOrder: "asc" }], include: { parent: true } })); } catch (e) { next(e); } });
app.get("/api/v1/categories", async (_req, res, next) => { try { res.json(await prisma.propertyCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })); } catch (e) { next(e); } });
app.get("/api/v1/amenities", async (_req, res, next) => { try { res.json(await prisma.amenity.findMany({ where: { active: true }, orderBy: { name: "asc" } })); } catch (e) { next(e); } });

app.get("/api/v1/listings", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
    const q = String(req.query.q ?? "").trim(); const mode = ["SALE", "RENT", "WANTED"].includes(String(req.query.mode)) ? String(req.query.mode) as any : undefined;
    const where: any = { status: "PUBLISHED", ...(mode ? { mode } : { mode: { in: ["SALE", "RENT"] } }) };
    if (q) where.OR = [{ title: { contains: q } }, { description: { contains: q } }, { addressLine: { contains: q } }];
    if (req.query.category) where.category = { slug: String(req.query.category) };
    if (req.query.location) where.location = { OR: [{ slug: String(req.query.location) }, { parent: { slug: String(req.query.location) } }] };
    if (req.query.minPrice || req.query.maxPrice) where.price = { ...(req.query.minPrice ? { gte: Number(req.query.minPrice) } : {}), ...(req.query.maxPrice ? { lte: Number(req.query.maxPrice) } : {}) };
    if (req.query.bedrooms) where.bedrooms = { gte: Number(req.query.bedrooms) };
    let whereOrder: any = { createdAt: "desc" };
    if (req.query.sort === "price_asc") whereOrder = { price: "asc" }; else if (req.query.sort === "price_desc") whereOrder = { price: "desc" };
    const [items, total] = await Promise.all([prisma.listing.findMany({ where, include: publicListingInclude, orderBy: whereOrder, skip: (page - 1) * pageSize, take: pageSize }), prisma.listing.count({ where })]);
    res.json({ data: items.map(listingResponse), meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});
app.get("/api/v1/listings/:slug", async (req, res, next) => { try { const listing = await prisma.listing.findFirst({ where: { slug: req.params.slug, status: "PUBLISHED" }, include: publicListingInclude }); if (!listing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Listing not found." } }); res.json(listingResponse(listing)); } catch (e) { next(e); } });

const credentials = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2).optional() });
app.post("/api/v1/auth/register", async (req, res, next) => { try { const data = credentials.parse(req.body); const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } }); if (exists) return res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } }); const buyerRole = await prisma.role.findUniqueOrThrow({ where: { key: "buyer_renter" } }); const user = await prisma.user.create({ data: { email: data.email.toLowerCase(), name: data.name ?? data.email.split("@")[0], passwordHash: await bcrypt.hash(data.password, 10), roles: { create: { roleId: buyerRole.id } } }, include: { roles: { include: { role: true } } } }); const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: "7d" }); res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, roles: user.roles.map(({ role }) => role.key) } }); } catch (e) { next(e); } });
app.post("/api/v1/auth/login", async (req, res, next) => { try { const data = credentials.pick({ email: true, password: true }).parse(req.body); const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }, include: { roles: { include: { role: true } } } }); if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }); const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: "7d" }); res.json({ token, user: { id: user.id, name: user.name, email: user.email, roles: user.roles.map(({ role }) => role.key) } }); } catch (e) { next(e); } });
app.get("/api/v1/auth/me", auth, async (req: AuthRequest, res, next) => { try { const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { roles: { include: { role: true } } } }); res.json({ id: user.id, name: user.name, email: user.email, roles: user.roles.map(({ role }) => role.key) }); } catch (e) { next(e); } });

const listingInput = z.object({ title: z.string().min(8), description: z.string().min(20), mode: z.enum(["SALE", "RENT", "WANTED"]), categoryId: z.string(), locationId: z.string(), addressLine: z.string().min(4), price: z.number().int().positive().nullable().optional(), negotiable: z.boolean().optional(), rentalPeriod: z.string().nullable().optional(), floorArea: z.number().positive().nullable().optional(), bedrooms: z.number().int().min(0).nullable().optional(), bathrooms: z.number().int().min(0).nullable().optional(), latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional() });
app.get("/api/v1/listings/mine", auth, async (req: AuthRequest, res, next) => { try { const listings = await prisma.listing.findMany({ where: { OR: [{ createdById: req.user!.id }, { assignedAgentId: req.user!.id }] }, include: publicListingInclude, orderBy: { updatedAt: "desc" } }); res.json(listings.map(listingResponse)); } catch (e) { next(e); } });
app.post("/api/v1/listings", auth, requireRole("owner", "agent"), async (req: AuthRequest, res, next) => { try { const data = listingInput.parse(req.body); const listing = await prisma.listing.create({ data: { ...data, slug: `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now()}`, createdById: req.user!.id, price: data.price ?? null, negotiable: data.negotiable ?? false, rentalPeriod: data.rentalPeriod ?? null, floorArea: data.floorArea ?? null, bedrooms: data.bedrooms ?? null, bathrooms: data.bathrooms ?? null, latitude: data.latitude ?? null, longitude: data.longitude ?? null }, include: publicListingInclude }); res.status(201).json(listingResponse(listing)); } catch (e) { next(e); } });
app.post("/api/v1/listings/:id/submit-review", auth, requireRole("owner", "agent"), async (req: AuthRequest, res, next) => { try { const listing = await prisma.listing.updateMany({ where: { id: String(req.params.id), createdById: req.user!.id, status: { in: ["DRAFT", "REJECTED"] } }, data: { status: "PENDING_REVIEW", submittedAt: new Date(), rejectionReason: null } }); if (!listing.count) return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: "This listing cannot be submitted." } }); res.json({ status: "PENDING_REVIEW" }); } catch (e) { next(e); } });

app.post("/api/v1/listings/:id/save", auth, async (req: AuthRequest, res, next) => { try { await prisma.savedListing.upsert({ where: { userId_listingId: { userId: req.user!.id, listingId: String(req.params.id) } }, create: { userId: req.user!.id, listingId: String(req.params.id) }, update: {} }); res.status(201).json({ saved: true }); } catch (e) { next(e); } });
app.delete("/api/v1/listings/:id/save", auth, async (req: AuthRequest, res, next) => { try { await prisma.savedListing.deleteMany({ where: { userId: req.user!.id, listingId: String(req.params.id) } }); res.json({ saved: false }); } catch (e) { next(e); } });
app.post("/api/v1/listings/:id/inquiries", auth, async (req: AuthRequest, res, next) => { try { const input = z.object({ message: z.string().min(10), phone: z.string().optional() }).parse(req.body); const listing = await prisma.listing.findUniqueOrThrow({ where: { id: String(req.params.id) } }); const inquiry = await prisma.inquiry.create({ data: { listingId: listing.id, senderId: req.user!.id, recipientId: listing.assignedAgentId ?? listing.createdById, ...input } }); res.status(201).json(inquiry); } catch (e) { next(e); } });
app.post("/api/v1/listings/:id/viewing-requests", auth, async (req: AuthRequest, res, next) => { try { const input = z.object({ requestedDate: z.coerce.date(), message: z.string().optional() }).parse(req.body); const request = await prisma.viewingRequest.create({ data: { listingId: String(req.params.id), requesterId: req.user!.id, ...input } }); res.status(201).json(request); } catch (e) { next(e); } });

app.get("/api/v1/admin/review-queue", auth, requireRole("staff", "admin"), async (_req, res, next) => { try { const listings = await prisma.listing.findMany({ where: { status: { in: ["PENDING_REVIEW", "SUSPENDED"] } }, include: publicListingInclude, orderBy: { submittedAt: "asc" } }); res.json(listings.map(listingResponse)); } catch (e) { next(e); } });
const moderation = (status: "PUBLISHED" | "REJECTED" | "SUSPENDED" | "ARCHIVED") => [auth, requireRole("staff", "admin"), async (req: AuthRequest, res: Response, next: NextFunction) => { try { const listing = await prisma.listing.update({ where: { id: String(req.params.id) }, data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined, rejectionReason: status === "REJECTED" ? String(req.body.reason ?? "Please update the listing details.") : null, archivedAt: status === "ARCHIVED" ? new Date() : null } }); await prisma.auditLog.create({ data: { actorId: req.user!.id, entityType: "Listing", entityId: listing.id, action: status, metadata: JSON.stringify({ reason: req.body.reason }) } }); res.json(listingResponse(listing)); } catch (e) { next(e); } }];
app.post("/api/v1/admin/listings/:id/approve", moderation("PUBLISHED"));
app.post("/api/v1/admin/listings/:id/reject", moderation("REJECTED"));
app.post("/api/v1/admin/listings/:id/suspend", moderation("SUSPENDED"));
app.post("/api/v1/admin/listings/:id/archive", moderation("ARCHIVED"));

app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => { console.error(error); if (error?.name === "ZodError") return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Please check the highlighted fields.", fields: error.issues } }); res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }); });
app.listen(port, () => console.log(`Eve Choice API listening on http://localhost:${port}`));

