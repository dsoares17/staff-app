import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const ROLE_OPTIONS = [
  'Host',
  'Driver',
  'Instructor',
  'Product Explainer',
  'Coordinator',
]

const inputClass =
  'w-full rounded-lg border bg-app px-3 py-2 text-sm text-fg outline-none focus:border-accent'
const inputStyle = { borderColor: '#222222' }

function getInitials(name) {
  if (!name?.trim()) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function parseRoles(roles) {
  if (!roles) return []
  if (Array.isArray(roles)) return roles
  try {
    return JSON.parse(roles)
  } catch {
    return []
  }
}

function profileToForm(profile) {
  return {
    fullName: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    location: profile?.location ?? '',
    bio: profile?.bio ?? '',
    roles: parseRoles(profile?.roles),
    sizeTshirt: profile?.size_tshirt ?? '',
    sizeJacket: profile?.size_jacket ?? '',
    sizeTrousers: profile?.size_trousers ?? '',
    sizeShoes: profile?.size_shoes ?? '',
  }
}

function Card({ children }) {
  return <div className="mb-3 rounded-xl bg-surface px-4 py-3">{children}</div>
}

function SectionLabel({ children }) {
  return (
    <p className="mb-2 text-xs uppercase tracking-wide text-[#888888]">{children}</p>
  )
}

function ViewRow({ label, value }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs text-[#888888]">{label}</p>
      <p className="mt-0.5 text-sm text-fg">{value || '—'}</p>
    </div>
  )
}

export default function Profile() {
  const { user, profile: authProfile, loading: authLoading, signOut } = useAuth()
  const navigate = useNavigate()
  const avatarInputRef = useRef(null)

  const [profile, setProfile] = useState(null)
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState(profileToForm(null))

  async function resolvePhotoUrl(photoUrl) {
    if (!photoUrl) return null
    if (photoUrl.startsWith('http')) return photoUrl

    const { data } = await supabase.storage
      .from('staff-avatars')
      .createSignedUrl(photoUrl, 3600)

    return data?.signedUrl ?? null
  }

  async function loadProfile() {
    if (!user?.id) return

    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('staff_app_users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
      setError('Não foi possível carregar o perfil.')
      setLoading(false)
      return
    }

    setProfile(data)
    setForm(profileToForm(data))
    setPhotoDisplayUrl(await resolvePhotoUrl(data?.photo_url))
    setLoading(false)
  }

  useEffect(() => {
    if (authLoading) return undefined
    if (!user) {
      setLoading(false)
      return undefined
    }

    if (authProfile) {
      setProfile(authProfile)
      setForm(profileToForm(authProfile))
      resolvePhotoUrl(authProfile.photo_url).then(setPhotoDisplayUrl)
    }

    loadProfile()
  }, [user?.id, authLoading])

  function startEditing() {
    setForm(profileToForm(profile))
    setError('')
    setSuccess('')
    setEditing(true)
  }

  function cancelEditing() {
    setForm(profileToForm(profile))
    setError('')
    setEditing(false)
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function toggleRole(role) {
    setForm((current) => {
      const roles = current.roles.includes(role)
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role]
      return { ...current, roles }
    })
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    e.target.value = ''

    setUploadingPhoto(true)
    setError('')

    try {
      const path = `${user.id}/avatar.jpg`
      const { error: uploadError } = await supabase.storage
        .from('staff-avatars')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data, error: updateError } = await supabase
        .from('staff_app_users')
        .update({ photo_url: path })
        .eq('id', user.id)
        .select('*')
        .single()

      if (updateError) throw updateError

      setProfile(data)
      setPhotoDisplayUrl(await resolvePhotoUrl(path))
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar a foto.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleSave() {
    if (!user?.id) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const { data, error: updateError } = await supabase
        .from('staff_app_users')
        .update({
          full_name: form.fullName.trim(),
          phone: form.phone.trim() || null,
          location: form.location.trim() || null,
          bio: form.bio.trim() || null,
          roles: form.roles,
          size_tshirt: form.sizeTshirt.trim() || null,
          size_jacket: form.sizeJacket.trim() || null,
          size_trousers: form.sizeTrousers.trim() || null,
          size_shoes: form.sizeShoes.trim() || null,
        })
        .eq('id', user.id)
        .select('*')
        .single()

      if (updateError) throw updateError

      setProfile(data)
      setForm(profileToForm(data))
      setEditing(false)
      setSuccess('Perfil atualizado ✓')
    } catch (err) {
      setError(err.message || 'Não foi possível guardar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-full bg-app px-4 pt-4">
        <div className="mx-auto mb-6 h-8 w-32 animate-pulse rounded bg-surface" />
        <div className="mx-auto mb-4 h-20 w-20 animate-pulse rounded-full bg-surface" />
        <div className="mb-3 h-24 animate-pulse rounded-xl bg-surface" />
        <div className="mb-3 h-24 animate-pulse rounded-xl bg-surface" />
      </div>
    )
  }

  const displayName = editing ? form.fullName : profile?.full_name
  const displayLocation = editing ? form.location : profile?.location
  const roles = editing ? form.roles : parseRoles(profile?.roles)

  return (
    <div className="min-h-full bg-app pb-6">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        {editing ? (
          <>
            <button
              type="button"
              onClick={cancelEditing}
              className="text-sm text-[#888888]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-sm font-semibold text-accent disabled:opacity-60"
            >
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Perfil</h1>
            <button
              type="button"
              onClick={startEditing}
              className="text-sm font-semibold text-accent"
            >
              Editar
            </button>
          </>
        )}
      </header>

      {success ? (
        <p className="px-4 pb-2 text-center text-sm text-accent">{success}</p>
      ) : null}
      {error ? (
        <p className="px-4 pb-2 text-center text-sm text-danger">{error}</p>
      ) : null}

      <section className="mb-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-accent">
          {photoDisplayUrl ? (
            <img
              src={photoDisplayUrl}
              alt={displayName || 'Foto de perfil'}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg font-semibold text-[#000000]">
              {getInitials(displayName)}
            </span>
          )}
        </div>

        {editing ? (
          <>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              type="button"
              disabled={uploadingPhoto}
              onClick={() => avatarInputRef.current?.click()}
              className="mt-2 text-sm text-accent disabled:opacity-60"
            >
              {uploadingPhoto ? 'A carregar foto…' : 'Alterar foto'}
            </button>
          </>
        ) : null}

        <h2 className="mt-3 text-lg font-semibold text-fg">{displayName}</h2>
        {displayLocation ? (
          <p className="mt-1 text-sm text-[#888888]">{displayLocation}</p>
        ) : null}
      </section>

      <div className="px-4">
        <Card>
          <SectionLabel>Informação pessoal</SectionLabel>

          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Nome completo</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.fullName}
                  onChange={(e) => updateForm('fullName', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Telefone</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Localização</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.location}
                  onChange={(e) => updateForm('location', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Bio</span>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  style={inputStyle}
                  value={form.bio}
                  onChange={(e) => updateForm('bio', e.target.value)}
                />
              </label>
            </div>
          ) : (
            <>
              <ViewRow label="Nome completo" value={profile?.full_name} />
              <ViewRow label="Telefone" value={profile?.phone} />
              <ViewRow label="Localização" value={profile?.location} />
              <ViewRow label="Bio" value={profile?.bio} />
            </>
          )}
        </Card>

        <Card>
          <SectionLabel>Funções</SectionLabel>

          {editing ? (
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.roles.includes(role)
                      ? 'bg-accent text-[#000000]'
                      : 'bg-[#222222] text-[#888888]'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          ) : roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
                >
                  {role}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#888888]">Nenhuma função definida</p>
          )}
        </Card>

        <Card>
          <SectionLabel>Tamanhos</SectionLabel>

          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">T-shirt</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Ex: M, L, XL, 42..."
                  value={form.sizeTshirt}
                  onChange={(e) => updateForm('sizeTshirt', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Casaco</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Ex: M, L, XL, 42..."
                  value={form.sizeJacket}
                  onChange={(e) => updateForm('sizeJacket', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Calças</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Ex: M, L, XL, 42..."
                  value={form.sizeTrousers}
                  onChange={(e) => updateForm('sizeTrousers', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Sapatos</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Ex: M, L, XL, 42..."
                  value={form.sizeShoes}
                  onChange={(e) => updateForm('sizeShoes', e.target.value)}
                />
              </label>
            </div>
          ) : (
            <>
              <ViewRow label="T-shirt" value={profile?.size_tshirt} />
              <ViewRow label="Casaco" value={profile?.size_jacket} />
              <ViewRow label="Calças" value={profile?.size_trousers} />
              <ViewRow label="Sapatos" value={profile?.size_shoes} />
            </>
          )}
        </Card>

        <Card>
          <SectionLabel>Conta</SectionLabel>
          <ViewRow label="Email" value={user?.email ?? profile?.email} />
        </Card>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-2 w-full rounded-lg border border-danger bg-transparent py-3 text-sm font-medium text-danger"
        >
          Terminar sessão
        </button>
      </div>
    </div>
  )
}
