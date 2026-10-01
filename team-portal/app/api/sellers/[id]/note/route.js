import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import SellerAssignment from '@/lib/models/SellerAssignment';

export async function PUT(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { id: sellerId } = params;
    const body = await req.json();

    const { customName, age, occupation, maritalStatus, location, picture, details } = body;

    // Find assignment for this seller
    let assignment = await SellerAssignment.findOne({
      sellerId,
      status: 'active',
      ...(session.role === 'member' ? { memberId: session._id } : {}),
    });

    if (!assignment) {
      // If none found and user is admin or assigned member, create one
      assignment = new SellerAssignment({
        sellerId,
        memberId: session._id,
        assignedBy: session._id,
        status: 'active',
      });
    }

    assignment.privateNotes = {
      customName: customName !== undefined ? customName : assignment.privateNotes?.customName || '',
      age: age !== undefined ? age : assignment.privateNotes?.age || '',
      occupation: occupation !== undefined ? occupation : assignment.privateNotes?.occupation || '',
      maritalStatus: maritalStatus !== undefined ? maritalStatus : assignment.privateNotes?.maritalStatus || '',
      location: location !== undefined ? location : assignment.privateNotes?.location || '',
      picture: picture !== undefined ? picture : assignment.privateNotes?.picture || '',
      details: details !== undefined ? details : assignment.privateNotes?.details || '',
      updatedAt: new Date(),
    };

    await assignment.save();

    return NextResponse.json({
      message: 'Memory note updated successfully',
      privateNotes: assignment.privateNotes,
    });
  } catch (err) {
    console.error('Update seller note error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
