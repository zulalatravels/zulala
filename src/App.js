import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import 'react-toastify/dist/ReactToastify.css';

// Layout Components
import Layout from './components/Layout/Layout';
import AuthLayout from './components/Layout/AuthLayout';
import AdminLayout from './components/Layout/AdminLayout';

// Context Providers
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { CartProvider } from './context/CartContext';

// Protected Routes
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

// Pages
import Home from './pages/Home';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import VerifyEmail from './pages/Auth/VerifyEmail';

// Car Pages
import CarList from './pages/Cars/CarList';
import CarDetail from './pages/Cars/CarDetail';
import SearchResults from './pages/Cars/SearchResults';

// Booking Pages
import BookingForm from './pages/Bookings/BookingForm';
import MyBookings from './pages/Bookings/MyBookings';
import BookingDetail from './pages/Bookings/BookingDetail';
import BookingConfirmation from './pages/Bookings/BookingConfirmation';

// User Pages
import Profile from './pages/User/Profile';
import ReferAndEarn from './pages/User/ReferAndEarn';
import Wallet from './pages/User/Wallet';
import Notifications from './pages/User/Notifications';

// Admin Pages
import AdminDashboard from './pages/Admin/Dashboard';
import AdminCars from './pages/Admin/Cars/List';
import AdminCarForm from './pages/Admin/Cars/Form';
import AdminBookings from './pages/Admin/Bookings/List';
import AdminUsers from './pages/Admin/Users/List';
import AdminOffers from './pages/Admin/Offers/List';
import AdminReports from './pages/Admin/Reports';

// Error Pages
import NotFound from './pages/Errors/NotFound';
import ServerError from './pages/Errors/ServerError';

// Initialize React Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationProvider>
            <CartProvider>
              <Router>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<Layout><Home /></Layout>} />
                  <Route path="/cars" element={<Layout><CarList /></Layout>} />
                  <Route path="/cars/search" element={<Layout><SearchResults /></Layout>} />
                  <Route path="/cars/:id" element={<Layout><CarDetail /></Layout>} />
                  
                  {/* Auth Routes */}
                  <Route path="/login" element={<AuthLayout><Login /></AuthLayout>} />
                  <Route path="/register" element={<AuthLayout><Register /></AuthLayout>} />
                  <Route path="/forgot-password" element={<AuthLayout><ForgotPassword /></AuthLayout>} />
                  <Route path="/reset-password/:token" element={<AuthLayout><ResetPassword /></AuthLayout>} />
                  <Route path="/verify-email/:token" element={<AuthLayout><VerifyEmail /></AuthLayout>} />
                  
                  {/* Protected User Routes */}
                  <Route path="/book" element={
                    <ProtectedRoute>
                      <Layout><BookingForm /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/booking-confirmation/:id" element={
                    <ProtectedRoute>
                      <Layout><BookingConfirmation /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/my-bookings" element={
                    <ProtectedRoute>
                      <Layout><MyBookings /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/bookings/:id" element={
                    <ProtectedRoute>
                      <Layout><BookingDetail /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/profile" element={
                    <ProtectedRoute>
                      <Layout><Profile /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/refer" element={
                    <ProtectedRoute>
                      <Layout><ReferAndEarn /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/wallet" element={
                    <ProtectedRoute>
                      <Layout><Wallet /></Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/notifications" element={
                    <ProtectedRoute>
                      <Layout><Notifications /></Layout>
                    </ProtectedRoute>
                  } />
                  
                  {/* Admin Routes */}
                  <Route path="/admin" element={
                    <AdminRoute>
                      <Navigate to="/admin/dashboard" replace />
                    </AdminRoute>
                  } />
                  <Route path="/admin/dashboard" element={
                    <AdminRoute>
                      <AdminLayout><AdminDashboard /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/cars" element={
                    <AdminRoute>
                      <AdminLayout><AdminCars /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/cars/new" element={
                    <AdminRoute>
                      <AdminLayout><AdminCarForm /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/cars/:id/edit" element={
                    <AdminRoute>
                      <AdminLayout><AdminCarForm /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/bookings" element={
                    <AdminRoute>
                      <AdminLayout><AdminBookings /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/users" element={
                    <AdminRoute>
                      <AdminLayout><AdminUsers /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/offers" element={
                    <AdminRoute>
                      <AdminLayout><AdminOffers /></AdminLayout>
                    </AdminRoute>
                  } />
                  <Route path="/admin/reports" element={
                    <AdminRoute>
                      <AdminLayout><AdminReports /></AdminLayout>
                    </AdminRoute>
                  } />
                  
                  {/* Error Routes */}
                  <Route path="/500" element={<ServerError />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                
                {/* Toast Containers */}
                <ToastContainer 
                  position="top-right"
                  autoClose={5000}
                  hideProgressBar={false}
                  newestOnTop
                  closeOnClick
                  rtl={false}
                  pauseOnFocusLoss
                  draggable
                  pauseOnHover
                />
                <Toaster 
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: '#363636',
                      color: '#fff',
                    },
                    success: {
                      duration: 3000,
                      theme: {
                        primary: 'green',
                        secondary: 'black',
                      },
                    },
                  }}
                />
              </Router>
            </CartProvider>
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;