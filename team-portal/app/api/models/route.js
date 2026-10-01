import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ModelProfile from '@/lib/models/ModelProfile';

export const dynamic = 'force-dynamic';

// GET /api/models — view models and photo galleries
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const models = await ModelProfile.find().sort({ createdAt: -1 });
    return NextResponse.json({ models });
  } catch (err) {
    console.error('Fetch models error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// POST /api/models — Admin creates new model profile with unlimited photos
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Only admin can add models.' }, { status: 403 });
    }

    const body = await req.json();
    const { name, age, dob, location, familyDetails, occupation, moreDetails, avatar, photos } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ message: 'Model name is required' }, { status: 400 });
    }

    const newModel = await ModelProfile.create({
      name: name.trim(),
      age: age ? Number(age) : null,
      dob: dob || '',
      location: location || '',
      familyDetails: familyDetails || '',
      occupation: occupation || '',
      moreDetails: moreDetails || '',
      avatar: avatar || photos?.[0]?.url || '',
      photos: Array.isArray(photos) ? photos : [],
      createdBy: session._id,
    });

    return NextResponse.json({
      message: 'Model profile created successfully',
      model: newModel,
    }, { status: 201 });
  } catch (err) {
    console.error('Create model error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
