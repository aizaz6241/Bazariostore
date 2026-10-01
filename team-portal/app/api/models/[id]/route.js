import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ModelProfile from '@/lib/models/ModelProfile';

export async function GET(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const model = await ModelProfile.findById(params.id);
    if (!model) return NextResponse.json({ message: 'Model not found' }, { status: 404 });

    return NextResponse.json({ model });
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// PUT /api/models/[id] — update profile or add photos (Admin only)
export async function PUT(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin only.' }, { status: 403 });
    }

    const body = await req.json();
    const model = await ModelProfile.findById(params.id);
    if (!model) return NextResponse.json({ message: 'Model not found' }, { status: 404 });

    if (body.name) model.name = body.name.trim();
    if (body.age !== undefined) model.age = body.age ? Number(body.age) : null;
    if (body.dob !== undefined) model.dob = body.dob;
    if (body.location !== undefined) model.location = body.location;
    if (body.familyDetails !== undefined) model.familyDetails = body.familyDetails;
    if (body.occupation !== undefined) model.occupation = body.occupation;
    if (body.moreDetails !== undefined) model.moreDetails = body.moreDetails;
    if (body.avatar !== undefined) model.avatar = body.avatar;

    // Append new photos if provided
    if (Array.isArray(body.newPhotos) && body.newPhotos.length > 0) {
      model.photos.push(...body.newPhotos);
    } else if (Array.isArray(body.photos)) {
      model.photos = body.photos;
    }

    await model.save();

    return NextResponse.json({
      message: 'Model updated successfully',
      model,
    });
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// DELETE /api/models/[id] — delete model (Admin only)
export async function DELETE(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin only.' }, { status: 403 });
    }

    await ModelProfile.findByIdAndDelete(params.id);
    return NextResponse.json({ message: 'Model profile deleted successfully' });
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
