import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard/Dashboard.jsx'
import ProductList from './pages/Products/ProductList.jsx'
import UnitTypeList from './pages/UnitTypes/UnitTypeList.jsx'
import InvoiceList from './pages/Invoices/InvoiceList.jsx'
import InvoiceCreate from './pages/Invoices/InvoiceCreate.jsx'
import InvoiceDetail from './pages/Invoices/InvoiceDetail.jsx'
import PurchaseList from './pages/Purchases/PurchaseList.jsx'
import PurchaseCreate from './pages/Purchases/PurchaseCreate.jsx'
import PartnerList from './pages/Partners/PartnerList.jsx'
import PartnerDetail from './pages/Partners/PartnerDetail.jsx'
import SupplierList from './pages/Suppliers/SupplierList.jsx'
import UserPriceList from './pages/UserPrices/UserPriceList.jsx'
import ReportPage from './pages/Reports/ReportPage.jsx'
import StockList from './pages/Stock/StockList.jsx'
import EmployeeList from './pages/Employees/EmployeeList.jsx'
import DebtList from './pages/Debts/DebtList.jsx'
import CategoryList from './pages/Categories/CategoryList.jsx'
import LocationList from './pages/Locations/LocationList.jsx'
import Settings from './pages/Settings/Settings.jsx'
import InvoiceEdit from './pages/Invoices/Invoiceedit.jsx'
import ActivityLogList from './pages/ActivityLogs/ActivityLogList.jsx'
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">កំពុងផ្ទុក...</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"        element={<Dashboard />} />
        <Route path="products"         element={<ProductList />} />
        <Route path="/invoices/:id/edit" element={<InvoiceEdit />} />
        <Route path="unit-types"       element={<UnitTypeList />} />
        <Route path="invoices"         element={<InvoiceList />} />
        <Route path="invoices/create"  element={<InvoiceCreate />} />
        <Route path="invoices/:id"     element={<InvoiceDetail />} />
        <Route path="purchases"        element={<PurchaseList />} />
        <Route path="purchases/create" element={<PurchaseCreate />} />
        <Route path="partners"         element={<PartnerList />} />
        <Route path="partners/:id"     element={<PartnerDetail />} />
        <Route path="suppliers"        element={<SupplierList />} />
        <Route path="user-prices"      element={<UserPriceList />} />
        <Route path="reports"          element={<ReportPage />} />
        <Route path="stock"            element={<StockList />} />
        <Route path="employees"        element={<EmployeeList />} />
        <Route path="debts"            element={<DebtList />} />
        <Route path="categories"       element={<CategoryList />} />
        <Route path="locations"         element={<LocationList />} />
        <Route path="settings"         element={<Settings />} />
        <Route path="/activity-logs" element={<ActivityLogList />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}