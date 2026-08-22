import React, { useState } from 'react';
import { Routes, Route, Navigate, NavLink, useParams, useLocation, useNavigate } from 'react-router-dom';

import { useAdminAuth } from '../../context/AdminContext';
import ProfileDrawer from '../shared/ProfileDrawer.jsx';
import Overview from './Overview';
import CollegesView from './CollegesView';
import CoursesView from './CoursesView';
import ExamsView from './ExamsView';
import QuestionsView from './QuestionsView';
import CollegeOverview from './CollegeOverview.jsx';
import AllDrives from './AllDrives.jsx';
import AllDrivesGlobal from './AllDrivesGlobal.jsx';
import DriveDetails from './DriveDetails.jsx';
import AdminBanners from './AdminBanners.jsx';
import AdminRegistrationContent from './AdminRegistrationContent.jsx';
import AdminExamSettings from './AdminExamSettings.jsx';
import StudentDetails from './StudentDetails.jsx';

const NAV_ITEMS = [
  { id: 'overview',  label: 'Overview',        icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'colleges',  label: 'Colleges',        icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'courses',   label: 'Courses',         icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { id: 'exams',     label: 'Exams',           icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'drives',    label: 'Drives',          icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'questions', label: 'Question Upload', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

function SidebarLink({ adminKey, item, onNavigate }) {
  return (
    <NavLink
      to={`/${adminKey}/admin/${item.id}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150 ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
        }`
      }
    >
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
      </svg>
      <span className="whitespace-nowrap">{item.label}</span>
    </NavLink>
  );
}

function SidebarContent({ adminKey, onNavigate }) {
  return (
    <>
      <div className="h-20 flex items-center px-5 border-b" style={{ borderColor: 'var(--eb-border)' }}>
        <img src="/logo.png" alt="EchoBrains Logo" className="h-10 w-auto object-contain" draggable={false} />
      </div>

      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <SidebarLink key={item.id} adminKey={adminKey} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      {/* Logout lives in the profile drawer (top-right avatar) only —
          having it here too was a duplicate control. */}
    </>
  );
}

export default function AdminDashboard() {
  const { logoutAdmin, adminEmail } = useAdminAuth();
  const { adminKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // .includes (not .endsWith) so drill-down routes like /colleges/123/drives/45
  // still correctly show "Colleges" as the current section in the header.
  // "banners", "registration-content", and "exam-settings" are
  // intentionally NOT in NAV_ITEMS (reachable only via the Profile
  // drawer, not the sidebar) - special-cased here just for the header
  // label, so none of them falls back to showing "Overview" while
  // actually on that page.
  const currentTab = location.pathname.includes('/banners')
    ? 'Exam Banners'
    : location.pathname.includes('/registration-content')
    ? 'Registration Page Content'
    : location.pathname.includes('/exam-settings')
    ? 'Exam Settings'
    : NAV_ITEMS.find(i => location.pathname.includes(`/${i.id}`))?.label || 'Overview';
  
const TAB_SUBTITLES = {
  overview: 'Real-time insights on placement drives and student performance',
};

const currentSubtitle = NAV_ITEMS.find(i => location.pathname.includes(`/${i.id}`))?.id
  ? TAB_SUBTITLES[NAV_ITEMS.find(i => location.pathname.includes(`/${i.id}`)).id]
  : null;


  return (
    <div className="flex h-screen w-full font-sans overflow-hidden" style={{ background: 'var(--eb-bg)' }}>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-64 flex-col border-r" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <SidebarContent adminKey={adminKey} />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <div className="relative w-64 flex flex-col animate-slide-in" style={{ background: 'var(--eb-surface)' }}>
            <SidebarContent adminKey={adminKey} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 lg:h-20 flex items-center justify-between px-4 lg:px-8 border-b flex-shrink-0"
          style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Open navigation menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          
<div>
  <h1 className="text-lg lg:text-xl font-semibold text-slate-800 dark:text-slate-100">{currentTab}</h1>
  {currentSubtitle && (
    <p className="hidden sm:block text-xs mt-0.5" style={{ color: 'var(--eb-text-faint)' }}>{currentSubtitle}</p>
  )}
</div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setProfileOpen(true)}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 -mr-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
            aria-label="Open profile menu">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{adminEmail || 'Admin'}</span>
              <span className="text-xs" style={{ color: 'var(--eb-text-muted)' }}>Administrator</span>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm text-white dark:text-slate-100 flex-shrink-0"
              style={{ background: 'var(--eb-blue)' }}>
              {(adminEmail || 'A').charAt(0).toUpperCase()}
            </div>
          </button>
        </div>
      </header>

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Admin Profile"
        roleLabel="Administrator"
        fields={[
          { label: 'Email', value: adminEmail },
          { label: 'Portal', value: 'EchoBrains Admin Portal' },
        ]}
        extraLinks={[
          { label: 'Edit Exam Banners', onClick: () => { setProfileOpen(false); navigate(`/${adminKey}/admin/banners`); } },
          { label: 'Edit Registration Page Data', onClick: () => { setProfileOpen(false); navigate(`/${adminKey}/admin/registration-content`); } },
          { label: 'Exam Settings', onClick: () => { setProfileOpen(false); navigate(`/${adminKey}/admin/exam-settings`); } },
        ]}
        onLogout={logoutAdmin}
      />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            <Routes>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<Overview />} />
              <Route path="colleges" element={<CollegesView />} />
              <Route path="colleges/:collegeId" element={<CollegeOverview />} />
              <Route path="colleges/:collegeId/drives" element={<AllDrives />} />
              <Route path="colleges/:collegeId/drives/:driveId" element={<DriveDetails />} />
              <Route path="drives" element={<AllDrivesGlobal />} />
              <Route path="drives/:driveId" element={<DriveDetails />} />
              <Route path="banners" element={<AdminBanners />} />
              <Route path="registration-content" element={<AdminRegistrationContent />} />
              <Route path="exam-settings" element={<AdminExamSettings />} />
              <Route path="students/:studentId" element={<StudentDetails />} />
              <Route path="courses" element={<CoursesView />} />
              <Route path="exams" element={<ExamsView />} />
              <Route path="questions" element={<QuestionsView />} />
              <Route path="*" element={<Navigate to="overview" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
