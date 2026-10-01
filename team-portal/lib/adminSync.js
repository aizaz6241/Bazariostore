import mongoose from 'mongoose';
import Member from '@/lib/models/Member';

/**
 * Synchronizes all administrators from the ecommerce platform's `admins` collection
 * into `PortalMember` documents.
 * Ensures each admin has their own distinct profile, name, credentials, and conversation threads.
 */
export async function syncEcommerceAdmins() {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];

    const ecommerceAdmins = await db.collection('admins').find({}).toArray();
    const syncedAdmins = [];

    for (const eAdmin of ecommerceAdmins) {
      if (!eAdmin.email) continue;
      const cleanEmail = eAdmin.email.toLowerCase().trim();
      const cleanUsername = cleanEmail.split('@')[0].toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const adminName = eAdmin.name || cleanUsername;

      // 1. Match by ecommerceAdminId first, then by email or username
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
        portalAdmin.ecommerceAdminId = eAdmin._id;
        portalAdmin.email = cleanEmail;
        portalAdmin.name = adminName;
        portalAdmin.role = 'admin';
        portalAdmin.passwordHash = eAdmin.passwordHash;
        if (eAdmin.phone) portalAdmin.phone = eAdmin.phone;
        await portalAdmin.save();
        syncedAdmins.push(portalAdmin);
      } else {
        // Ensure unique username
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
          plainPassword: '',
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
