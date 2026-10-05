import mongoose from 'mongoose';
import Member from '@/lib/models/Member';

/**
 * Synchronizes all administrators from the ecommerce platform's `admins` collection
 * into `PortalMember` documents.
 * 
 * Features:
 * 1. LIVE NAME & PROFILE UPDATES: Any name or detail change made on the ecommerce admin panel
 *    is instantly synced and updated here.
 * 2. AUTOMATIC DELETION: If an admin is deleted from the ecommerce platform, their account
 *    is automatically removed from the team management system.
 * 3. NEW ADMIN ONBOARDING: Any new admin added to ecommerce platform is automatically created here.
 */
export async function syncEcommerceAdmins() {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];

    const ecommerceAdmins = await db.collection('admins').find({}).toArray();

    // ─── 1. Identify Valid Active Ecommerce Admins ───
    const validEcommerceAdminIds = ecommerceAdmins.map((a) => a._id.toString());
    const validEcommerceEmails = ecommerceAdmins.map((a) => (a.email || '').toLowerCase().trim());

    // ─── 2. Auto-Delete Portal Admins that were deleted from Ecommerce Website ───
    const existingPortalAdmins = await Member.find({ role: 'admin' });

    for (const pAdmin of existingPortalAdmins) {
      // Only evaluate admins that were specifically linked to the ecommerce platform
      if (!pAdmin.ecommerceAdminId) {
        continue; // Local portal admin - protect from deletion
      }

      const hasValidId = validEcommerceAdminIds.includes(pAdmin.ecommerceAdminId.toString());
      const hasValidEmail = pAdmin.email && validEcommerceEmails.includes(pAdmin.email.toLowerCase().trim());

      // If this synced ecommerce admin no longer exists in the main ecommerce database, remove them!
      if (!hasValidId && !hasValidEmail) {
        console.log(`[adminSync] Deleting removed ecommerce admin from portal: ${pAdmin.name} (${pAdmin.username})`);
        await Member.deleteOne({ _id: pAdmin._id });
      }
    }

    // ─── 3. Sync & Update Active Ecommerce Admins ───
    const syncedAdmins = [];

    for (const eAdmin of ecommerceAdmins) {
      if (!eAdmin.email) continue;
      const cleanEmail = eAdmin.email.toLowerCase().trim();
      const cleanUsername = cleanEmail.split('@')[0].toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const adminName = eAdmin.name || cleanUsername;

      // Match by ecommerceAdminId first, then by email or username
      let portalAdmin = await Member.findOne({ ecommerceAdminId: eAdmin._id });

      if (!portalAdmin) {
        portalAdmin = await Member.findOne({
          $or: [
            { email: cleanEmail },
            { username: cleanUsername },
          ],
        });
      }

      if (portalAdmin) {
        // ALWAYS update name, email, and password to reflect any changes on ecommerce website!
        portalAdmin.ecommerceAdminId = eAdmin._id;
        portalAdmin.email = cleanEmail;
        portalAdmin.name = adminName; // Updates name instantly if changed on ecom site!
        portalAdmin.role = 'admin';
        portalAdmin.passwordHash = eAdmin.passwordHash;
        if (eAdmin.phone !== undefined) portalAdmin.phone = eAdmin.phone || '';
        if (eAdmin.active !== undefined) portalAdmin.active = eAdmin.active;
        await portalAdmin.save();
        syncedAdmins.push(portalAdmin);
      } else {
        // Create new synced admin
        let finalUsername = cleanUsername;
        const exists = await Member.findOne({ username: finalUsername });
        if (exists) {
          finalUsername = `${cleanUsername}_admin`;
        }

        portalAdmin = await Member.create({
          name: adminName,
          username: finalUsername,
          email: cleanEmail,
          ecommerceAdminId: eAdmin._id,
          passwordHash: eAdmin.passwordHash,
          role: 'admin',
          phone: eAdmin.phone || '',
          active: eAdmin.active !== false,
          wallet: { balancePKR: 0, totalDepositsPKR: 0, totalWithdrawalsPKR: 0, totalBonusesPKR: 0 },
        });
        syncedAdmins.push(portalAdmin);
      }
    }

    return syncedAdmins;
  } catch (err) {
    console.error('Failed to sync ecommerce admins:', err);
    return [];
  }
}
