import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Modal, Toggle, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function Categories() {
  const [cats, setCats] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = () => api('/categories/admin/list').then(setCats).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (edit._id) await api(`/categories/${edit._id}`, { method: 'PUT', body: edit });
      else await api('/categories', { method: 'POST', body: edit });
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (c) => {
    await api(`/categories/${c._id}/active`, { method: 'PATCH' });
    load();
  };

  const del = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try {
      await api(`/categories/${c._id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      const [up] = await api('/uploads', { method: 'POST', body: fd });
      setEdit((prev) => ({ ...prev, image: up }));
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Categories</h1>
        <button className="btn-primary" onClick={() => setEdit({ name: '', image: null, sortOrder: cats.length })}>
          <Ic name="plus" size={15} /> ADD CATEGORY
        </button>
      </div>
      <ErrorBox error={error} />

      <div className="card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th /><th>Name</th><th>Slug</th><th>Products</th><th>Sort</th><th>Active</th><th /></tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c._id} className={c.active ? '' : 'row-inactive'}>
                  <td><span className="cart-thumb thumb-sm"><img src={c.image?.url} alt="" /></span></td>
                  <td><b>{c.name}</b></td>
                  <td>{c.slug}</td>
                  <td>{c.productCount}</td>
                  <td>{c.sortOrder}</td>
                  <td><Toggle small on={c.active} onChange={() => toggle(c)} /></td>
                  <td className="row-actions">
                    <button className="row-link" onClick={() => setEdit(c)}>Edit</button>
                    <button className="row-link danger" onClick={() => del(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <Modal title={edit._id ? 'Edit Category' : 'Add Category'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <F label="Category Name *"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></F>
            <F label="Sort Order"><input type="number" value={edit.sortOrder || 0} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} /></F>
            <F label="Image">
              <div className="cat-img-row">
                {edit.image?.url && <span className="cart-thumb"><img src={edit.image.url} alt="" /></span>}
                <label className="btn-outline btn-sm">
                  {uploading ? 'Uploading…' : edit.image?.url ? 'Replace Image' : 'Upload Image'}
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadImage} />
                </label>
              </div>
            </F>
            <div className="form-actions">
              <button className="btn-primary">SAVE</button>
              <button type="button" className="btn-outline" onClick={() => setEdit(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
