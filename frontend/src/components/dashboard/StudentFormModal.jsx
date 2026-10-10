import React, { useEffect, useState } from 'react';
import axios from '../../utils/api';

const empty = {
  fullName: '',
  email: '',
  dob: '',
  gender: '',
  phoneNumber: '',
  collegeName: '',
  location: '',
  state: '',
  branch: '',
  highestQualification: '',
  aggregateMarks: '',
  academicScoreType: 'PERCENTAGE',
  yearOfPassing: '',
  courseName: '',
  selectedInCampusDrive: ''
};

const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none';
const styleObj = {
  background: 'var(--eb-surface)',
  borderColor: 'var(--eb-border)',
  color: 'var(--eb-text)'
};

const FALLBACK_DOMAINS = [
  'CSE & CSE Allied Branches',
  'ECE',
  'ISE',
  'AI/ML',
  'EEE'
];

const FALLBACK_QUALIFICATIONS = [
  'B.E/B.Tech',
  'M.E/M.Tech',
  'MCA'
];

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function isAtLeast18(value) {
  if (!value) return false;

  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  const minimumAgeDate = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate()
  );

  return dob <= minimumAgeDate;
}

export default function StudentFormModal({
  open,
  onClose,
  initialStudent = null,
  onSaved
}) {
  const [form, setForm] = useState(empty);

  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [domainOptions, setDomainOptions] = useState(FALLBACK_DOMAINS);
  const [qualificationOptions, setQualificationOptions] = useState(FALLBACK_QUALIFICATIONS);
  const [yearOptions, setYearOptions] = useState([]);
  const [registrationSettings, setRegistrationSettings] = useState({genderEnabled:true,dobEnabled:true,qualificationEnabled:true,yearEnabled:true,academicScoreEnabled:true,academicScoreType:'BOTH',otherCampusDriveEnabled:true});
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});

  const [customDomain, setCustomDomain] = useState('');
  const [customQualification, setCustomQualification] = useState('');
  const [customYear, setCustomYear] = useState('');

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const editing = Boolean(initialStudent?.studentId);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadRegistrationOptions = async () => {
      setLoadingOptions(true);
      setError('');

      try {
        const [collegeRes, courseRes, dropdownRes, settingsRes, customFieldRes] = await Promise.all([
          axios.get('/admin/colleges/public'),
          axios.get('/admin/courses/public', { params: { isActive: true } }),
          axios.get('/admin/dropdown-options/public'),
          axios.get('/admin/registration-settings/public'),
          axios.get('/admin/registration-fields/public')
        ]);

        if (cancelled) return;

        if (settingsRes?.data) { setRegistrationSettings(settingsRes.data); if(settingsRes.data.academicScoreType==='CGPA'||settingsRes.data.academicScoreType==='PERCENTAGE') setForm(prev=>({...prev,academicScoreType:settingsRes.data.academicScoreType})); }
        setCustomFields(Array.isArray(customFieldRes?.data) ? customFieldRes.data : []);

        const nextColleges = Array.isArray(collegeRes.data?.colleges)
          ? collegeRes.data.colleges
          : [];

        const nextCourses = Array.isArray(courseRes.data)
          ? courseRes.data
          : [];

        const nextDomains = Array.isArray(dropdownRes.data?.DOMAIN) &&
          dropdownRes.data.DOMAIN.length
          ? dropdownRes.data.DOMAIN
          : FALLBACK_DOMAINS;

        const nextQualifications = Array.isArray(dropdownRes.data?.QUALIFICATION) &&
          dropdownRes.data.QUALIFICATION.length
          ? dropdownRes.data.QUALIFICATION
          : FALLBACK_QUALIFICATIONS;

        const nextYears = Array.isArray(dropdownRes.data?.YEAR_OF_PASSING) &&
          dropdownRes.data.YEAR_OF_PASSING.length
          ? dropdownRes.data.YEAR_OF_PASSING.map(String)
          : [
              String(currentYear - 1),
              String(currentYear),
              String(currentYear + 1),
              String(currentYear + 2)
            ];

        setColleges(nextColleges);
        setCourses(nextCourses);
        setDomainOptions(nextDomains);
        setQualificationOptions(nextQualifications);
        setYearOptions(nextYears);

        if (!initialStudent) {
          setForm(empty);
          setCustomValues({});
          setCustomDomain('');
          setCustomQualification('');
          setCustomYear('');
          return;
        }

        const existingBranch = initialStudent.branch || '';
        const existingQualification = initialStudent.highestQualification || '';
        const existingYear = initialStudent.yearOfPassing
          ? String(initialStudent.yearOfPassing)
          : '';

        const branchIsManaged = nextDomains.includes(existingBranch);
        const qualificationIsManaged = nextQualifications.includes(existingQualification);
        const yearIsManaged = nextYears.includes(existingYear);

        const college = nextColleges.find(
          c => String(c.name || '').toLowerCase() ===
            String(initialStudent.collegeName || '').toLowerCase()
        );

        setForm({
          fullName: initialStudent.fullName || '',
          email: initialStudent.email || '',
          dob: toDateInput(initialStudent.dob),
          gender: initialStudent.gender || '',
          phoneNumber: initialStudent.phoneNumber || '',
          collegeName: initialStudent.collegeName || '',
          location: college?.location || initialStudent.location || '',
          state: college?.state || initialStudent.state || '',
          branch: branchIsManaged ? existingBranch : existingBranch ? 'Other' : '',
          highestQualification: qualificationIsManaged
            ? existingQualification
            : existingQualification
              ? 'Other'
              : '',
          aggregateMarks: initialStudent.aggregateMarks ?? '',
          academicScoreType: initialStudent.academicScoreType || 'PERCENTAGE',
          yearOfPassing: yearIsManaged ? existingYear : existingYear ? 'Other' : '',
          courseName: initialStudent.courseName || '',
          selectedInCampusDrive: initialStudent.selectedInCampusDrive || 'No'
        });

        setCustomValues(initialStudent.customFields || {});
        setCustomDomain(branchIsManaged ? '' : existingBranch);
        setCustomQualification(
          qualificationIsManaged ? '' : existingQualification
        );
        setCustomYear(yearIsManaged ? '' : existingYear);
      } catch {
        if (cancelled) return;

        // Keep the same registration fallback behavior if dynamic options fail.
        setColleges([]);
        setCourses([]);
        setDomainOptions(FALLBACK_DOMAINS);
        setQualificationOptions(FALLBACK_QUALIFICATIONS);
        setYearOptions([
          String(currentYear - 1),
          String(currentYear),
          String(currentYear + 1),
          String(currentYear + 2)
        ]);

        if (!initialStudent) {
          setForm(empty);
          setCustomValues({});
          setCustomDomain('');
          setCustomQualification('');
          setCustomYear('');
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };

    loadRegistrationOptions();

    return () => {
      cancelled = true;
    };
  }, [open, initialStudent, currentYear]);

  if (!open) return null;

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const handleCollegeChange = (value) => {
    const college = colleges.find(
      c => String(c.name || '') === String(value)
    );

    setForm(prev => ({
      ...prev,
      collegeName: value,
      location: college?.location || '',
      state: college?.state || ''
    }));

    setError('');
  };

  const validate = () => {
    if (!form.fullName.trim()) return 'Full name is required.';
    if (!form.email.trim()) return 'Email ID is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Enter a valid email address.';
    }

    if (!/^\d{10}$/.test(form.phoneNumber.trim())) {
      return 'Mobile number must be exactly 10 digits.';
    }

    if (registrationSettings.genderEnabled && !form.gender) return 'Please select gender.';
    if (registrationSettings.dobEnabled && !form.dob) return 'Date of birth is required.';
    if (registrationSettings.dobEnabled && !isAtLeast18(form.dob)) return 'Student must be at least 18 years old.';

    if (!form.collegeName) return 'Please select a college.';
    if (!form.location) return 'College location is required.';
    if (!form.state) return 'College state is required.';

    if (!form.branch) return 'Please select your domain / branch.';
    if (form.branch === 'Other' && !customDomain.trim()) {
      return 'Please enter the domain / branch.';
    }

    if (registrationSettings.qualificationEnabled && !form.highestQualification) return 'Please select your highest qualification.';
    if (registrationSettings.qualificationEnabled && form.highestQualification === 'Other' && !customQualification.trim()) return 'Please enter your qualification.';

    if (registrationSettings.academicScoreEnabled) {
      if (form.aggregateMarks === '') return form.academicScoreType === 'CGPA' ? 'CGPA is required.' : 'Aggregate percentage is required.';
      const score = Number(form.aggregateMarks);
      if (Number.isNaN(score)) return 'Enter a valid academic score.';
      if (form.academicScoreType === 'CGPA' && (score < 0 || score > 10)) return 'CGPA must be between 0 and 10.';
      if (form.academicScoreType === 'PERCENTAGE' && (score < 0 || score > 100)) return 'Aggregate percentage must be between 0 and 100.';
    }

    if (registrationSettings.yearEnabled && !form.yearOfPassing) return 'Please select year of passing.';

    if (form.yearOfPassing === 'Other') {
      const year = Number(customYear);
      if (!/^\d{4}$/.test(customYear) || Number.isNaN(year)) {
        return 'Enter a valid year of passing.';
      }
      if (year < currentYear - 1) {
        return `Year of passing cannot be earlier than ${currentYear - 1}.`;
      }
    }

    if (!form.courseName) return 'Please select a course / domain.';
    if (!form.selectedInCampusDrive) {
      return 'Please specify whether the student is selected in another campus drive.';
    }

    return '';
  };

  const submit = async (e) => {
    e.preventDefault();

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        ...form,
        branch: form.branch === 'Other'
          ? customDomain.trim()
          : form.branch,
        highestQualification: form.highestQualification === 'Other'
          ? customQualification.trim()
          : form.highestQualification,
        aggregateMarks: Number(form.aggregateMarks),
        yearOfPassing: Number(
          form.yearOfPassing === 'Other'
            ? customYear
            : form.yearOfPassing
        ),
        customFields: customValues
      };

      if (editing) {
        await axios.put(
          `/admin/students/${initialStudent.studentId}`,
          payload
        );
      } else {
        await axios.post('/admin/students', payload);
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'Could not save student. Please check the details.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{
        background: 'rgba(15,23,42,.60)',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl p-6"
        style={styleObj}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold">
              {editing ? 'Edit Student' : 'Register Student'}
            </h3>

            <p
              className="text-xs mt-1"
              style={{ color: 'var(--eb-text-muted)' }}
            >
              {editing
                ? 'Correct the student details without changing exam history.'
                : 'Register one student using the same registration options and rules as the student registration page.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xl"
            style={{ color: 'var(--eb-text-muted)' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            <Field label="Full Name">
              <input
                required
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                className={inputClass}
                style={styleObj}
              />
            </Field>

            <Field label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className={inputClass}
                style={styleObj}
              />
            </Field>

            <Field label="Mobile Number">
              <input
                required
                maxLength={10}
                value={form.phoneNumber}
                onChange={e =>
                  set(
                    'phoneNumber',
                    e.target.value.replace(/\D/g, '').slice(0, 10)
                  )
                }
                className={inputClass}
                style={styleObj}
              />
            </Field>

            {registrationSettings.genderEnabled && <Field label="Gender">
              <select
                required
                value={form.gender}
                onChange={e => set('gender', e.target.value)}
                className={inputClass}
                style={styleObj}
              >
                <option value="">Select gender</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </Field>}

            {registrationSettings.dobEnabled && <Field label="Date of Birth">
              <input
                required
                type="date"
                value={form.dob}
                onChange={e => set('dob', e.target.value)}
                className={inputClass}
                style={styleObj}
              />
            </Field>}

            <Field label="College">
              <select
                required
                value={form.collegeName}
                onChange={e => handleCollegeChange(e.target.value)}
                className={inputClass}
                style={styleObj}
                disabled={loadingOptions}
              >
                <option value="">
                  {loadingOptions ? 'Loading colleges...' : 'Select college'}
                </option>

                {colleges.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Location">
              <input
                required
                readOnly
                value={form.location}
                className={`${inputClass} cursor-not-allowed`}
                style={{
                  ...styleObj,
                  background: 'var(--eb-surface-muted)'
                }}
                title="Automatically filled from the selected college"
              />
            </Field>

            <Field label="State">
              <input
                readOnly
                value={form.state}
                className={`${inputClass} cursor-not-allowed`}
                style={{
                  ...styleObj,
                  background: 'var(--eb-surface-muted)'
                }}
                title="Automatically filled from the selected college"
              />
            </Field>

            <Field label="Branch">
              <select
                required
                value={form.branch}
                onChange={e => {
                  const value = e.target.value;
                  set('branch', value);
                  if (value !== 'Other') setCustomDomain('');
                }}
                className={inputClass}
                style={styleObj}
                disabled={loadingOptions}
              >
                <option value="">Select branch</option>
                {domainOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
            </Field>

            {form.branch === 'Other' && (
              <Field label="Enter Domain / Branch">
                <input
                  required
                  value={customDomain}
                  onChange={e => setCustomDomain(e.target.value)}
                  placeholder="e.g. Mechanical Engineering"
                  className={inputClass}
                  style={styleObj}
                />
              </Field>
            )}

            {registrationSettings.qualificationEnabled && <Field label="Highest Qualification">
              <select
                required
                value={form.highestQualification}
                onChange={e => {
                  const value = e.target.value;
                  set('highestQualification', value);
                  if (value !== 'Other') setCustomQualification('');
                }}
                className={inputClass}
                style={styleObj}
                disabled={loadingOptions}
              >
                <option value="">Select qualification</option>
                {qualificationOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
            </Field>}

            {registrationSettings.qualificationEnabled && form.highestQualification === 'Other' && (
              <Field label="Enter Qualification">
                <input
                  required
                  value={customQualification}
                  onChange={e => setCustomQualification(e.target.value)}
                  placeholder="e.g. Diploma"
                  className={inputClass}
                  style={styleObj}
                />
              </Field>
            )}

            {registrationSettings.academicScoreEnabled && <Field
              label={
                form.academicScoreType === 'CGPA'
                  ? 'CGPA'
                  : 'Aggregate %'
              }
            >
              <div className="flex gap-2">
                {registrationSettings.academicScoreType === 'BOTH' ? <select
                  value={form.academicScoreType}
                  onChange={e => {
                    set('academicScoreType', e.target.value);
                    set('aggregateMarks', '');
                  }}
                  className={inputClass}
                  style={{ ...styleObj, width: '132px', flexShrink: 0 }}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="CGPA">CGPA</option>
                </select> : <div className="px-3 py-2.5 rounded-xl border text-sm flex items-center" style={{...styleObj,width:'132px',flexShrink:0}}>{registrationSettings.academicScoreType === 'CGPA' ? 'CGPA' : 'Percentage'}</div>}

                <input
                  required
                  type="number"
                  min="0"
                  max={form.academicScoreType === 'CGPA' ? 10 : 100}
                  step="0.01"
                  value={form.aggregateMarks}
                  onChange={e => set('aggregateMarks', e.target.value)}
                  className={inputClass}
                  style={{ ...styleObj, minWidth: 0 }}
                  placeholder={
                    form.academicScoreType === 'CGPA'
                      ? 'e.g. 8.50'
                      : 'e.g. 78.60'
                  }
                />
              </div>
            </Field>} 

            {registrationSettings.yearEnabled && <Field label="Year of Passing">
              <select
                required
                value={form.yearOfPassing}
                onChange={e => {
                  const value = e.target.value;
                  set('yearOfPassing', value);
                  if (value !== 'Other') setCustomYear('');
                }}
                className={inputClass}
                style={styleObj}
                disabled={loadingOptions}
              >
                <option value="">Select year</option>
                {yearOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
            </Field>}

            {registrationSettings.yearEnabled && form.yearOfPassing === 'Other' && (
              <Field label="Enter Year">
                <input
                  required
                  type="number"
                  min={currentYear - 1}
                  value={customYear}
                  onChange={e => setCustomYear(e.target.value)}
                  placeholder={`e.g. ${currentYear - 1} or later`}
                  className={inputClass}
                  style={styleObj}
                />
              </Field>
            )}

            <Field label="Course / Domain">
              <select
                required
                value={form.courseName}
                onChange={e => set('courseName', e.target.value)}
                className={inputClass}
                style={styleObj}
                disabled={loadingOptions}
              >
                <option value="">
                  {loadingOptions ? 'Loading courses...' : 'Select course'}
                </option>

                {courses.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            {registrationSettings.otherCampusDriveEnabled && <Field label="Selected in Any Other Campus Drive">
              <select
                required
                value={form.selectedInCampusDrive}
                onChange={e =>
                  set('selectedInCampusDrive', e.target.value)
                }
                className={inputClass}
                style={styleObj}
              >
                <option value="">Select option</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </Field>}
          </div>

          {customFields.length > 0 && <div className="space-y-3"><div className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>Additional Details</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{customFields.map(field => <Field key={field.fieldKey} label={field.label}><>{field.type === 'DROPDOWN' ? <select value={customValues[field.fieldKey] || ''} onChange={e => setCustomValues(v => ({ ...v, [field.fieldKey]: e.target.value }))} className={inputClass} style={styleObj}><option value="">Select {field.label}</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text'} value={customValues[field.fieldKey] || ''} onChange={e => setCustomValues(v => ({ ...v, [field.fieldKey]: e.target.value }))} className={inputClass} style={styleObj} />}</></Field>)}</div></div>}

          {error && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                color: '#DC2626',
                background: 'rgba(239,68,68,.08)',
                border: '1px solid rgba(239,68,68,.25)'
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border text-sm font-semibold"
              style={{
                borderColor: 'var(--eb-border)',
                color: 'var(--eb-text-muted)'
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || loadingOptions}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--eb-blue)' }}
            >
              {loading
                ? 'Saving…'
                : editing
                  ? 'Save Changes'
                  : 'Register Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span
        className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: 'var(--eb-text-faint)' }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
