'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Sparkles,
  Plus,
  Download,
  Image as ImageIcon,
  MapPin,
  Calendar,
  Briefcase,
  Users as FamilyIcon,
  Info,
  X,
  Trash2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

export default function ModelsPage() {
  const { user } = useAuth();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Model Gallery Modal
  const [activeGalleryModel, setActiveGalleryModel] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Create Model Modal (Admin only)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    age: '',
    dob: '',
    location: '',
    familyDetails: '',
    occupation: '',
    moreDetails: '',
    avatar: '',
    photosInput: '', // comma or newline separated URLs
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Add Photos Modal (Admin only)
  const [addPhotosModel, setAddPhotosModel] = useState(null);
  const [newPhotosInput, setNewPhotosInput] = useState('');
  const [addPhotosLoading, setAddPhotosLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

  const fetchModels = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/models', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (err) {
      console.error('Fetch models error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleCreateModel = async (e) => {
    e?.preventDefault();
    if (!createForm.name.trim()) return;

    try {
      setCreateLoading(true);
      const token = localStorage.getItem('portal_token');

      // Parse photos URLs
      const photoUrls = createForm.photosInput
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 5)
        .map((url, idx) => ({ url, title: `Photo ${idx + 1}` }));

      const body = {
        name: createForm.name.trim(),
        age: createForm.age ? Number(createForm.age) : null,
        dob: createForm.dob,
        location: createForm.location,
        familyDetails: createForm.familyDetails,
        occupation: createForm.occupation,
        moreDetails: createForm.moreDetails,
        avatar: createForm.avatar || photoUrls[0]?.url || '',
        photos: photoUrls,
      };

      const res = await fetch('/api/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsCreateModalOpen(false);
        setCreateForm({
          name: '',
          age: '',
          dob: '',
          location: '',
          familyDetails: '',
          occupation: '',
          moreDetails: '',
          avatar: '',
          photosInput: '',
        });
        fetchModels();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to create model profile');
      }
    } catch (err) {
      console.error('Create model error:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAddPhotos = async () => {
    if (!addPhotosModel || !newPhotosInput.trim()) return;

    try {
      setAddPhotosLoading(true);
      const token = localStorage.getItem('portal_token');

      const photoUrls = newPhotosInput
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 5)
        .map((url, idx) => ({ url, title: `Photo ${addPhotosModel.photos.length + idx + 1}` }));

      const res = await fetch(`/api/models/${addPhotosModel._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPhotos: photoUrls }),
      });

      if (res.ok) {
        setAddPhotosModel(null);
        setNewPhotosInput('');
        fetchModels();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to add photos');
      }
    } catch (err) {
      console.error('Add photos error:', err);
    } finally {
      setAddPhotosLoading(false);
    }
  };

  const handleDeleteModel = async (modelId) => {
    if (!confirm('Are you sure you want to delete this model profile?')) return;

    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/models/${modelId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchModels();
        if (activeGalleryModel?._id === modelId) setActiveGalleryModel(null);
      }
    } catch (err) {
      console.error('Delete model error:', err);
    }
  };

  // Direct Browser Download Function
  const downloadImage = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'model-photo.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Model Profiles & Asset Gallery
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
              {models.length} Models Available
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Upload model bios and unlimited high-definition photo assets for team usage.'
              : 'View model biographies, specs, and easily download unlimited photoshoot assets.'}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition shadow-md shadow-purple-600/20 active:scale-95 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Model</span>
          </button>
        )}
      </div>

      {/* Models Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Loading model profiles and photos...
        </div>
      ) : models.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 p-8">
          <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-3" />
          <p className="text-base font-bold text-slate-700">No models added yet</p>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin
              ? 'Click "Add New Model" above to create the first model profile and upload photos.'
              : 'Admin has not uploaded any model profiles yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models.map((model) => {
            const photosCount = model.photos?.length || 0;
            const coverPhoto = model.avatar || model.photos?.[0]?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80';

            return (
              <div
                key={model._id}
                className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-lg transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Model Cover Photo */}
                  <div className="relative h-64 sm:h-72 w-full bg-slate-100 overflow-hidden">
                    <img
                      src={coverPhoto}
                      alt={model.name}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Top photo count badge */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{photosCount} Photos</span>
                    </div>

                    {/* Name & Basic info on cover */}
                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      <h3 className="text-xl font-black tracking-tight">{model.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/90">
                        {model.age && <span>{model.age} years old</span>}
                        {model.location && (
                          <span className="flex items-center space-x-0.5">
                            <MapPin className="w-3 h-3 inline text-purple-300" />
                            <span>{model.location}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Profile Details List */}
                  <div className="p-5 space-y-2.5 text-xs text-slate-600">
                    {model.occupation && (
                      <div className="flex items-center space-x-2">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800">{model.occupation}</span>
                      </div>
                    )}

                    {model.dob && (
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>DOB: {model.dob}</span>
                      </div>
                    )}

                    {model.familyDetails && (
                      <div className="flex items-start space-x-2">
                        <FamilyIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-slate-600">{model.familyDetails}</span>
                      </div>
                    )}

                    {model.moreDetails && (
                      <div className="flex items-start space-x-2 pt-1 border-t border-slate-100">
                        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-slate-500 text-[11px] line-clamp-2">
                          {model.moreDetails}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                  {/* View & Download Gallery Button */}
                  <button
                    onClick={() => {
                      setActiveGalleryModel(model);
                      setSelectedPhoto(model.photos?.[0] || null);
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>View & Download ({photosCount})</span>
                  </button>

                  {/* Admin Controls */}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setAddPhotosModel(model);
                          setNewPhotosInput('');
                        }}
                        className="py-2.5 px-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
                        title="Upload more photos"
                      >
                        <Plus className="w-4 h-4 text-purple-600" />
                      </button>

                      <button
                        onClick={() => handleDeleteModel(model._id)}
                        className="py-2.5 px-2.5 rounded-xl bg-white border border-red-200 text-red-500 hover:bg-red-50 text-xs font-semibold"
                        title="Delete model"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODAL: Fullscreen Model Asset Gallery & Instant Download ─── */}
      {activeGalleryModel && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-fade-in">
          {/* Gallery Top Navigation */}
          <div className="flex items-center justify-between text-white pb-3 border-b border-white/10 shrink-0">
            <div>
              <h2 className="text-lg font-bold">{activeGalleryModel.name}</h2>
              <p className="text-xs text-white/60">
                {activeGalleryModel.photos?.length || 0} Photos available for instant download
              </p>
            </div>

            <button
              onClick={() => setActiveGalleryModel(null)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Active Featured Photo with Download Button */}
          <div className="flex-1 flex flex-col items-center justify-center my-4 overflow-hidden relative">
            {selectedPhoto ? (
              <div className="max-h-[65vh] relative flex items-center justify-center">
                <img
                  src={selectedPhoto.url}
                  alt={selectedPhoto.title || activeGalleryModel.name}
                  className="max-h-[62vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />

                {/* Instant Download Action overlay */}
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  <button
                    onClick={() =>
                      downloadImage(
                        selectedPhoto.url,
                        `${activeGalleryModel.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`
                      )
                    }
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-xl shadow-emerald-600/30 active:scale-95 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download High-Res</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-white/60 text-sm">No photos uploaded for this model yet.</p>
            )}
          </div>

          {/* Bottom Thumbnails Strip */}
          <div className="shrink-0 overflow-x-auto py-2 flex items-center space-x-3 border-t border-white/10">
            {activeGalleryModel.photos?.map((photo, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedPhoto(photo)}
                className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden cursor-pointer shrink-0 border-2 transition ${
                  selectedPhoto?.url === photo.url
                    ? 'border-emerald-500 scale-105'
                    : 'border-white/20 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={photo.url} alt={`thumb ${idx}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MODAL: Admin Create Model ─── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add New Model Profile</h3>
                <p className="text-xs text-slate-400">
                  Fill in profile bio and add unlimited photo URLs.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateModel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Priya Sharma"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={createForm.age}
                    onChange={(e) => setCreateForm({ ...createForm, age: e.target.value })}
                    placeholder="e.g. 23"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="text"
                    value={createForm.dob}
                    onChange={(e) => setCreateForm({ ...createForm, dob: e.target.value })}
                    placeholder="YYYY-MM-DD or DD Month"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                    placeholder="e.g. Mumbai, Maharashtra"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Occupation
                  </label>
                  <input
                    type="text"
                    value={createForm.occupation}
                    onChange={(e) => setCreateForm({ ...createForm, occupation: e.target.value })}
                    placeholder="e.g. Fashion Model & Creator"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Family Details
                </label>
                <input
                  type="text"
                  value={createForm.familyDetails}
                  onChange={(e) => setCreateForm({ ...createForm, familyDetails: e.target.value })}
                  placeholder="e.g. Parents in business, 1 younger brother"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Biography / More Details
                </label>
                <textarea
                  rows={2}
                  value={createForm.moreDetails}
                  onChange={(e) => setCreateForm({ ...createForm, moreDetails: e.target.value })}
                  placeholder="Background, style preferences, commercial experience..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unlimited Photos (1 Image URL per line)
                </label>
                <textarea
                  rows={4}
                  value={createForm.photosInput}
                  onChange={(e) => setCreateForm({ ...createForm, photosInput: e.target.value })}
                  placeholder="https://images.unsplash.com/photo-1534528741775-53994a69daeb...&#10;https://images.unsplash.com/photo-1524504388940-b1c1722653e1...&#10;https://images.unsplash.com/photo-1517841905240-472988babdf9..."
                  className="w-full font-mono text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white shadow-sm"
                >
                  {createLoading ? 'Publishing...' : 'Create Model Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Admin Add More Photos ─── */}
      {addPhotosModel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base">
                Add Photos to {addPhotosModel.name}
              </h3>
              <button
                onClick={() => setAddPhotosModel(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Paste Image URLs (1 URL per line)
              </label>
              <textarea
                rows={5}
                value={newPhotosInput}
                onChange={(e) => setNewPhotosInput(e.target.value)}
                placeholder="https://...&#10;https://..."
                className="w-full font-mono text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setAddPhotosModel(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPhotos}
                disabled={addPhotosLoading || !newPhotosInput.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white shadow-sm"
              >
                {addPhotosLoading ? 'Uploading...' : 'Save Photos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
