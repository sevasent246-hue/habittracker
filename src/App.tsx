import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, firebaseReady } from './firebase'
import type { Habit, HabitValues } from './types'

const COLORS = ['#6E8B74', '#C98F72', '#8B83B5', '#D2A94B', '#6D93A6']
const RU_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeek(offset: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  const day = (today.getDay() + 6) % 7
  monday.setDate(today.getDate() - day + offset * 7)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  })
}

function formatRange(days: Date[]) {
  const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
  return `${formatter.format(days[0]!)} — ${formatter.format(days[6]!)} ${days[6]!.getFullYear()}`
}

function authErrorMessage(code: string) {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Этот адрес уже зарегистрирован. Войдите в аккаунт.',
    'auth/invalid-email': 'Проверьте формат электронной почты.',
    'auth/weak-password': 'Придумайте пароль не короче 6 символов.',
    'auth/invalid-credential': 'Неверная почта или пароль.',
    'auth/user-disabled': 'Этот аккаунт временно отключён.',
    'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже.',
    'auth/network-request-failed': 'Не удалось подключиться. Проверьте интернет.',
  }
  return messages[code] ?? 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!auth)
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitsReady, setHabitsReady] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dialogHabit, setDialogHabit] = useState<Habit | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)
    })
  }, [])

  useEffect(() => {
    setHabits([])
    setHabitsReady(false)
    setLoadError('')
    if (!db || !user) return
    return onSnapshot(
      collection(db, 'users', user.uid, 'habits'),
      (snapshot) => {
        const nextHabits = snapshot.docs.map((habitDoc) => ({
          id: habitDoc.id,
          ...habitDoc.data(),
          completedDates: (habitDoc.data().completedDates as string[]) ?? [],
        })) as Habit[]
        nextHabits.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
        setHabits(nextHabits)
        setHabitsReady(true)
      },
      () => {
        setLoadError('Не удалось загрузить привычки. Проверьте правила Firestore и подключение.')
        setHabitsReady(true)
      },
    )
  }, [user])

  const weekDays = useMemo(() => getWeek(weekOffset), [weekOffset])
  const todayKey = localDateKey(new Date())
  const weekKeys = weekDays.map(localDateKey)
  const elapsedDays = weekKeys.filter((key) => key <= todayKey).length
  const possibleChecks = habits.length * elapsedDays
  const completedChecks = habits.reduce(
    (total, habit) => total + weekKeys.filter((key) => key <= todayKey && habit.completedDates.includes(key)).length,
    0,
  )
  const progress = possibleChecks === 0 ? 0 : Math.round((completedChecks / possibleChecks) * 100)

  async function saveHabit(values: HabitValues) {
    if (!db || !user) return
    try {
      const habitsCollection = collection(db, 'users', user.uid, 'habits')
      if (dialogHabit) {
        await updateDoc(doc(habitsCollection, dialogHabit.id), {
          ...values,
          updatedAt: serverTimestamp(),
        })
        setNotice('Привычка обновлена')
      } else {
        await addDoc(habitsCollection, {
          ...values,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          completedDates: [],
        })
        setNotice('Привычка добавлена')
      }
      setDialogHabit(undefined)
    } catch {
      setNotice('Не удалось сохранить. Проверьте правила Firestore и подключение.')
    }
  }

  async function toggleDay(habit: Habit, dateKey: string) {
    if (!db || !user || dateKey > todayKey) return
    const habitRef = doc(db, 'users', user.uid, 'habits', habit.id)
    try {
      await updateDoc(habitRef, {
        completedDates: habit.completedDates.includes(dateKey) ? arrayRemove(dateKey) : arrayUnion(dateKey),
        updatedAt: serverTimestamp(),
      })
    } catch {
      setNotice('Не удалось сохранить отметку. Проверьте подключение.')
    }
  }

  async function removeHabit(habit: Habit) {
    if (!db || !user || !window.confirm(`Удалить привычку «${habit.title}» и её отметки?`)) return
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'habits', habit.id))
      setNotice('Привычка удалена')
    } catch {
      setNotice('Не удалось удалить привычку. Попробуйте ещё раз.')
    }
  }

  if (!authReady) return <LoadingScreen />
  if (!user || !auth || !db) {
    return <AuthScreen onSignedIn={(nextUser) => setUser(nextUser)} />
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Мой ритм — начало">
          <span className="brand-mark"><BrandIcon /></span>
          <span>мой ритм</span>
        </a>
        <div className="account-actions">
          <span className="account-email" title={user.email ?? ''}>{user.email}</span>
          <button className="icon-button signout-button" onClick={() => auth && signOut(auth)} aria-label="Выйти">
            <SignOutIcon />
          </button>
        </div>
      </header>

      <div id="top" className="dashboard">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">ТВОЙ ЛИЧНЫЙ ТРЕКЕР</p>
            <h1>Маленькие шаги.<br /><span>Большие перемены.</span></h1>
            <p className="welcome-copy">Отмечай то, что важно, и замечай, как складывается твой ритм.</p>
          </div>
          <div className="week-selector" aria-label="Выбор недели">
            <button className="icon-button week-arrow" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Предыдущая неделя">
              <ChevronLeft />
            </button>
            <span>{weekOffset === 0 ? 'Эта неделя' : formatRange(weekDays)}</span>
            <button className="icon-button week-arrow" onClick={() => setWeekOffset((value) => Math.min(0, value + 1))} disabled={weekOffset === 0} aria-label="Следующая неделя">
              <ChevronRight />
            </button>
          </div>
        </section>

        <section className="summary-card" aria-label="Прогресс за неделю">
          <div className="summary-copy">
            <span className="summary-icon"><SparkleIcon /></span>
            <div>
              <p className="summary-label">ТВОЙ ПРОГРЕСС</p>
              <h2>{weekOffset === 0 ? 'Неделя в движении' : formatRange(weekDays)}</h2>
              <p className="summary-caption">
                {possibleChecks === 0
                  ? 'Добавь привычку, чтобы начать'
                  : `Выполнено ${completedChecks} из ${possibleChecks} отметок`}
              </p>
            </div>
          </div>
          <div className="progress-display">
            <div className="progress-track" role="progressbar" aria-label="Прогресс за неделю" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <strong>{progress}<small>%</small></strong>
          </div>
        </section>

        <section className="habits-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ПО ДНЯМ НЕДЕЛИ</p>
              <h2>Мои привычки <span className="habit-count">{habits.length}</span></h2>
            </div>
            <button className="primary-button" onClick={() => setDialogHabit(null)}>
              <PlusIcon /><span>Новая привычка</span>
            </button>
          </div>

          {loadError && <div className="inline-error" role="alert">{loadError}</div>}
          {!habitsReady ? (
            <div className="list-loading"><span className="spinner" /> Загружаем привычки…</div>
          ) : habits.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art"><PlantIcon /></div>
              <h3>Здесь вырастет твой новый ритм</h3>
              <p>Начни с одной простой привычки — и отмечай каждый маленький шаг.</p>
              <button className="secondary-button" onClick={() => setDialogHabit(null)}><PlusIcon /> Добавить привычку</button>
            </div>
          ) : (
            <div className="habit-list">
              <div className="days-header">
                <span className="day-header-label">ПРИВЫЧКА</span>
                {weekDays.map((day, index) => (
                  <div className={`day-heading ${localDateKey(day) === todayKey ? 'is-today' : ''}`} key={localDateKey(day)}>
                    <span>{RU_DAYS[index]}</span><strong>{day.getDate()}</strong>
                  </div>
                ))}
                <span className="actions-heading">ДЕЙСТВИЯ</span>
              </div>
              {habits.map((habit) => (
                <article className="habit-row" key={habit.id}>
                  <div className="habit-info">
                    <span className="habit-color" style={{ backgroundColor: habit.color }} />
                    <div className="habit-text">
                      <h3>{habit.title}</h3>
                      {habit.description && <p>{habit.description}</p>}
                    </div>
                  </div>
                  {weekDays.map((day) => {
                    const key = localDateKey(day)
                    const checked = habit.completedDates.includes(key)
                    const future = key > todayKey
                    return (
                      <div className="day-cell" key={key}>
                        <button
                          className={`check-button ${checked ? 'checked' : ''} ${key === todayKey ? 'today-check' : ''}`}
                          onClick={() => void toggleDay(habit, key)}
                          disabled={future}
                          aria-label={`${habit.title}: ${checked ? 'снять отметку' : 'отметить'}, ${day.toLocaleDateString('ru-RU')}`}
                          aria-pressed={checked}
                        >
                          {checked && <CheckIcon />}
                        </button>
                      </div>
                    )
                  })}
                  <div className="habit-actions">
                    <button className="icon-button" onClick={() => setDialogHabit(habit)} aria-label={`Редактировать ${habit.title}`}><EditIcon /></button>
                    <button className="icon-button delete-button" onClick={() => void removeHabit(habit)} aria-label={`Удалить ${habit.title}`}><TrashIcon /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <footer className="footer-note"><span className="footer-sparkle">✳</span> Регулярность важнее идеальности. Продолжай в своём темпе.</footer>
      </div>

      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Закрыть уведомление">×</button></div>}
      {dialogHabit !== undefined && <HabitDialog habit={dialogHabit} onClose={() => setDialogHabit(undefined)} onSave={saveHabit} />}
    </main>
  )
}

function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth) return
    setBusy(true)
    setError('')
    try {
      const credential = mode === 'register'
        ? await createUserWithEmailAndPassword(auth, email.trim(), password)
        : await signInWithEmailAndPassword(auth, email.trim(), password)
      onSignedIn(credential.user)
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
      setError(authErrorMessage(code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <header className="auth-brand brand"><span className="brand-mark"><BrandIcon /></span><span>мой ритм</span></header>
      <section className="auth-card">
        <div className="auth-card-top"><span className="auth-sparkle"><SparkleIcon /></span><p className="eyebrow">ПРИВЫЧКИ С ЗАБОТОЙ О СЕБЕ</p></div>
        <h1>{mode === 'register' ? 'Начни свой ритм' : 'С возвращением'}</h1>
        <p className="auth-subtitle">{mode === 'register' ? 'Создай аккаунт, чтобы бережно отслеживать свой прогресс.' : 'Войди, чтобы продолжить с того места, где остановился.'}</p>
        {!firebaseReady && (
          <div className="setup-notice" role="status">
            <strong>Остался один шаг</strong>
            <span>Подключи Firebase: создай файл <code>.env.local</code> по инструкции в README и перезапусти сайт.</span>
          </div>
        )}
        <div className="auth-tabs" role="tablist" aria-label="Действие с аккаунтом">
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Регистрация</button>
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Вход</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Электронная почта</label>
          <input id="email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="password">Пароль</label>
          <input id="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="Не менее 6 символов" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy || !firebaseReady}>
            {busy ? 'Подождите…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'} <ArrowIcon />
          </button>
        </form>
        <p className="privacy-note"><LockIcon /> Твои привычки доступны только тебе</p>
      </section>
      <p className="auth-footer">Один день за раз — и ты уже на пути.</p>
    </main>
  )
}

function HabitDialog({ habit, onClose, onSave }: {
  habit: Habit | null
  onClose: () => void
  onSave: (values: HabitValues) => Promise<void>
}) {
  const [title, setTitle] = useState(habit?.title ?? '')
  const [description, setDescription] = useState(habit?.description ?? '')
  const [color, setColor] = useState(habit?.color ?? COLORS[0]!)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    await onSave({ title: title.trim(), description: description.trim(), color })
    setBusy(false)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="habit-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading"><div><p className="eyebrow">ТВОЙ СЛЕДУЮЩИЙ ШАГ</p><h2 id="dialog-title">{habit ? 'Изменить привычку' : 'Новая привычка'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></div>
        <form onSubmit={submit}>
          <label htmlFor="habit-title">Название</label>
          <input id="habit-title" autoFocus maxLength={80} placeholder="Например, прогулка на свежем воздухе" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <label htmlFor="habit-description">Короткая заметка <span>(необязательно)</span></label>
          <textarea id="habit-description" maxLength={240} rows={3} placeholder="Что поможет не забыть?" value={description} onChange={(event) => setDescription(event.target.value)} />
          <fieldset className="color-picker"><legend>Цвет привычки</legend><div>{COLORS.map((option) => <button key={option} type="button" className={`color-option ${color === option ? 'selected' : ''}`} style={{ backgroundColor: option }} onClick={() => setColor(option)} aria-label={`Выбрать цвет ${option}`} aria-pressed={color === option} />)}</div></fieldset>
          <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
        </form>
      </section>
    </div>
  )
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="spinner" /><span>Загружаем твой ритм…</span></main>
}

function Icon({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return <svg viewBox={viewBox} aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">{children}</svg>
}

function BrandIcon() { return <Icon><path d="M12 20.2c-4.7-2.3-7.1-5.1-7.1-8.4a3.5 3.5 0 0 1 6.5-1.8l.6 1 .6-1a3.5 3.5 0 0 1 6.5 1.8c0 3.3-2.4 6.1-7.1 8.4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M12 10v4m-2-2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Icon> }
function SparkleIcon() { return <Icon><path d="m12 3 1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" fill="currentColor"/></Icon> }
function PlantIcon() { return <Icon><path d="M12 20v-8m0 3c-4.2 0-6.5-2.2-6.5-6.5C9.8 8.5 12 10.8 12 15Zm0-3c0-4.5 2.4-6.8 7-7 0 4.6-2.4 7-7 7Zm-5 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function PlusIcon() { return <Icon><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></Icon> }
function CheckIcon() { return <Icon><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function ChevronLeft() { return <Icon><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function ChevronRight() { return <Icon><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function EditIcon() { return <Icon><path d="m14.5 6.5 3 3M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function TrashIcon() { return <Icon><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function SignOutIcon() { return <Icon><path d="M10 17l5-5-5-5m5 5H3m9-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function ArrowIcon() { return <Icon><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Icon> }
function LockIcon() { return <Icon><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Icon> }

export default App
