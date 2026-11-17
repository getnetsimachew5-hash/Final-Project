import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// ---------- Public ----------
import Home             from './Pages/public/Home';
import About            from './Pages/public/About';
import Login            from './Pages/public/Login';
import Register         from './Pages/public/Register';
import WorkflowDiagram  from './Pages/public/WorkflowDiagram';

// ---------- Student ----------
import StudentDashboard from './Pages/student/Dashboard';
import StudentProfile    from './Pages/student/Profile';
import ReturnForm       from './Pages/student/ReturnForm';
import UploadLetter     from './Pages/student/UploadLetter';
import StudentStatus    from './Pages/student/Status';
import StudentNotifs    from './Pages/student/Notifications';
import StudentMessages  from './Pages/student/Messages';
import StudentHistory   from './Pages/student/History';

// ---------- CS Department ----------
import DeptDashboard   from './Pages/department/Dashboard';
import DeptSubmissions from './Pages/department/Submissions';
import DeptVerify      from './Pages/department/Verify';
import DeptCreateBatch from './Pages/department/CreateBatch';
import DeptEditBatch   from './Pages/department/EditBatch';
import DeptRequests    from './Pages/department/Requests';
import DeptForward     from './Pages/department/Forward';
import DeptRejected    from './Pages/department/Rejected';
import DeptHistory     from './Pages/department/History';
import DeptMessages    from './Pages/department/Messages';

// ---------- College ----------
import CollegeDashboard from './Pages/college/Dashboard';
import CollegePending   from './Pages/college/Pending';
import CollegeDocuments from './Pages/college/Documents';
import CollegeForward   from './Pages/college/Forward';
import CollegeHistory   from './Pages/college/History';
import CollegeMessages  from './Pages/college/Messages';

// ---------- Academic VP ----------
import AVDashboard   from './Pages/academicVP/Dashboard';
import AVApproved    from './Pages/academicVP/Approved';
import AVEligibility from './Pages/academicVP/Eligibility';
import AVDocuments   from './Pages/academicVP/Documents';
import AVHistory     from './Pages/academicVP/History';
import AVMessages    from './Pages/academicVP/Messages';

// ---------- Administrative VP ----------
import AdminVPDashboard   from './Pages/adminVP/Dashboard';
import AdminVPEndorsed    from './Pages/adminVP/Endorsed';
import AdminVPReview      from './Pages/adminVP/Review';
import AdminVPAuthorize   from './Pages/adminVP/Authorize';
import AdminVPHistory     from './Pages/adminVP/History';
import AdminVPMessages    from './Pages/adminVP/Messages';

// ---------- Finance ----------
import FinDashboard     from './Pages/finance/Dashboard';
import FinApproved      from './Pages/finance/Approved';
import FinProcess       from './Pages/finance/ProcessPayment';
import FinBatch         from './Pages/finance/BatchPayment';
import FinHistory       from './Pages/finance/History';
import FinReports       from './Pages/finance/Reports';
import FinMessages      from './Pages/finance/Messages';

// ---------- Admin ----------
import AdminDashboard from './Pages/Admin/Dashboard';
import AdminUsers     from './Pages/Admin/Users';
import AdminLogs      from './Pages/Admin/AuditLogs';
import AdminMessages  from './Pages/Admin/Messages';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"         element={<Home />} />
          <Route path="/about"    element={<About />} />
          <Route path="/workflow" element={<WorkflowDiagram />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Student */}
          <Route path="/student"                element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/profile"        element={<ProtectedRoute role="student"><StudentProfile /></ProtectedRoute>} />
          <Route path="/student/return"         element={<ProtectedRoute role="student"><ReturnForm /></ProtectedRoute>} />
          <Route path="/student/upload"         element={<ProtectedRoute role="student"><UploadLetter /></ProtectedRoute>} />
          <Route path="/student/status"         element={<ProtectedRoute role="student"><StudentStatus /></ProtectedRoute>} />
          <Route path="/student/notifications"  element={<ProtectedRoute role="student"><StudentNotifs /></ProtectedRoute>} />
          <Route path="/student/messages"       element={<ProtectedRoute role="student"><StudentMessages /></ProtectedRoute>} />
          <Route path="/student/history"        element={<ProtectedRoute role="student"><StudentHistory /></ProtectedRoute>} />

          {/* CS Dept */}
          <Route path="/cs-dept"             element={<ProtectedRoute role="cs_dept"><DeptDashboard /></ProtectedRoute>} />
          <Route path="/cs-dept/submissions" element={<ProtectedRoute role="cs_dept"><DeptSubmissions /></ProtectedRoute>} />
          <Route path="/cs-dept/verify"      element={<ProtectedRoute role="cs_dept"><DeptVerify /></ProtectedRoute>} />
          <Route path="/cs-dept/batch"       element={<ProtectedRoute role="cs_dept"><DeptCreateBatch /></ProtectedRoute>} />
          <Route path="/cs-dept/batch/:id/edit" element={<ProtectedRoute role="cs_dept"><DeptEditBatch /></ProtectedRoute>} />
          <Route path="/cs-dept/requests"    element={<ProtectedRoute role="cs_dept"><DeptRequests /></ProtectedRoute>} />
          <Route path="/cs-dept/forward"     element={<ProtectedRoute role="cs_dept"><DeptForward /></ProtectedRoute>} />
          <Route path="/cs-dept/rejected"    element={<ProtectedRoute role="cs_dept"><DeptRejected /></ProtectedRoute>} />
          <Route path="/cs-dept/history"     element={<ProtectedRoute role="cs_dept"><DeptHistory /></ProtectedRoute>} />
          <Route path="/cs-dept/messages"    element={<ProtectedRoute role="cs_dept"><DeptMessages /></ProtectedRoute>} />

          {/* College */}
          <Route path="/college"           element={<ProtectedRoute role="college"><CollegeDashboard /></ProtectedRoute>} />
          <Route path="/college/pending"   element={<ProtectedRoute role="college"><CollegePending /></ProtectedRoute>} />
          <Route path="/college/documents" element={<ProtectedRoute role="college"><CollegeDocuments /></ProtectedRoute>} />
          <Route path="/college/forward"   element={<ProtectedRoute role="college"><CollegeForward /></ProtectedRoute>} />
          <Route path="/college/history"   element={<ProtectedRoute role="college"><CollegeHistory /></ProtectedRoute>} />
          <Route path="/college/messages"  element={<ProtectedRoute role="college"><CollegeMessages /></ProtectedRoute>} />

          {/* Academic VP */}
          <Route path="/academic-vp"             element={<ProtectedRoute role="academic_vp"><AVDashboard /></ProtectedRoute>} />
          <Route path="/academic-vp/approved"    element={<ProtectedRoute role="academic_vp"><AVApproved /></ProtectedRoute>} />
          <Route path="/academic-vp/eligibility" element={<ProtectedRoute role="academic_vp"><AVEligibility /></ProtectedRoute>} />
          <Route path="/academic-vp/documents"   element={<ProtectedRoute role="academic_vp"><AVDocuments /></ProtectedRoute>} />
          <Route path="/academic-vp/history"     element={<ProtectedRoute role="academic_vp"><AVHistory /></ProtectedRoute>} />
          <Route path="/academic-vp/messages"    element={<ProtectedRoute role="academic_vp"><AVMessages /></ProtectedRoute>} />

          {/* Administrative VP */}
          <Route path="/admin-vp"           element={<ProtectedRoute role="admin_vp"><AdminVPDashboard /></ProtectedRoute>} />
          <Route path="/admin-vp/endorsed"  element={<ProtectedRoute role="admin_vp"><AdminVPEndorsed /></ProtectedRoute>} />
          <Route path="/admin-vp/review"    element={<ProtectedRoute role="admin_vp"><AdminVPReview /></ProtectedRoute>} />
          <Route path="/admin-vp/authorize" element={<ProtectedRoute role="admin_vp"><AdminVPAuthorize /></ProtectedRoute>} />
          <Route path="/admin-vp/history"   element={<ProtectedRoute role="admin_vp"><AdminVPHistory /></ProtectedRoute>} />
          <Route path="/admin-vp/messages"  element={<ProtectedRoute role="admin_vp"><AdminVPMessages /></ProtectedRoute>} />

          {/* Finance */}
          <Route path="/finance"            element={<ProtectedRoute role="finance"><FinDashboard /></ProtectedRoute>} />
          <Route path="/finance/approved"   element={<ProtectedRoute role="finance"><FinApproved /></ProtectedRoute>} />
          <Route path="/finance/individual" element={<ProtectedRoute role="finance"><FinProcess /></ProtectedRoute>} />
          <Route path="/finance/batch"      element={<ProtectedRoute role="finance"><FinBatch /></ProtectedRoute>} />
          <Route path="/finance/history"    element={<ProtectedRoute role="finance"><FinHistory /></ProtectedRoute>} />
          <Route path="/finance/reports"    element={<ProtectedRoute role="finance"><FinReports /></ProtectedRoute>} />
          <Route path="/finance/messages"   element={<ProtectedRoute role="finance"><FinMessages /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin"       element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/logs"  element={<ProtectedRoute role="admin"><AdminLogs /></ProtectedRoute>} />
          <Route path="/admin/messages" element={<ProtectedRoute role="admin"><AdminMessages /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}