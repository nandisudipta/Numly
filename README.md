# NUMLY - Cloud Bookkeeping System

A modern, production-ready multi-business bookkeeping and inventory ledger system designed for teams and small businesses.

## Features

### Core Functionality
- Multi-business management with team collaboration
- Book-based organization for grouping ledgers
- Flexible ledger system supporting INR, Grams, and Pieces
- Cash In/Out transaction tracking with real-time balance calculation
- Transaction attachments (images and PDFs up to 10MB)
- Real-time sync across all team members
- Role-based access control

### Team Management
- **Captain**: Full control including business deletion and team management
- **Vice Captain**: Manage books, ledgers, and transactions (cannot delete business)
- **Team Member**: Add transactions and view data (cannot delete books/ledgers)
- **Viewer**: Read-only access to all data

### Security
- Email/password authentication
- Google OAuth integration
- Row Level Security (RLS) enforced at database level
- Secure file storage for transaction attachments
- Email-based team invitation system

### User Experience
- Mobile-first responsive design
- Progressive Web App (PWA) - installable on all devices
- Premium fintech-inspired UI with deep matte black theme
- Soft royal gold accents (#D4AF37)
- Real-time data synchronization
- Optimistic UI updates for instant feedback

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for blazing-fast development
- Tailwind CSS for styling
- React Router for navigation
- Lucide React for icons

### Backend
- Supabase for backend services
  - PostgreSQL database
  - Authentication (email/password + Google OAuth)
  - Real-time subscriptions
  - File storage
  - Row Level Security

### PWA
- Vite PWA Plugin
- Service Worker with Workbox
- Offline support
- App-like experience

## Database Schema

### Tables
- `profiles` - User profile information
- `businesses` - Business entities
- `business_members` - Team membership with roles
- `business_invitations` - Pending team invitations
- `books` - Bookkeeping books within businesses
- `ledgers` - Ledgers with unit types (INR/gram/pieces)
- `transactions` - Cash in/out transactions with attachments

### Key Features
- Automatic captain membership creation on business creation
- Automatic profile creation on user signup
- Updated timestamps on all records
- Comprehensive indexes for performance
- Helper functions for role checking

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Environment variables are already configured in `.env`:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key

4. The database schema has been automatically applied with migrations

5. Enable Google OAuth in Supabase Dashboard:
   - Go to Authentication > Providers
   - Enable Google provider
   - Add your Google OAuth credentials

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The optimized production build will be in the `dist` folder.

### Preview Production Build

```bash
npm run preview
```

## Application Flow

1. **Authentication** → Sign up or log in with email or Google
2. **Business List** → View and create businesses
3. **Books** → Organize ledgers into books within a business
4. **Ledgers** → Create ledgers with specific units (INR, grams, pieces)
5. **Transactions** → Add cash in/out transactions with optional attachments
6. **Team Management** → Invite members and manage roles

## Key Design Decisions

### Colors
- Background: Deep Matte Black (#0B0B0B)
- Cards: Warm White (#F5F5F3)
- Accent: Soft Royal Gold (#D4AF37)
- Cash In: Green (#10B981)
- Cash Out: Red (#EF4444)

### Architecture
- Mobile-first responsive design
- Calculated ledger balances (never manually edited)
- Real-time updates via Supabase subscriptions
- Optimistic UI for instant feedback
- Strict permission enforcement at UI and database levels

### File Organization
- Modular component structure
- Separate pages for each major feature
- Reusable UI components
- Type-safe with TypeScript
- Clean separation of concerns

## Security Considerations

### Authentication
- Secure session management
- Auto token refresh
- Protected routes

### Database
- Row Level Security on all tables
- Foreign key constraints
- Cascading deletes where appropriate
- SET NULL for user references when users are deleted

### File Upload
- Size limit: 10MB
- Allowed types: JPG, PNG, PDF only
- Stored in Supabase Storage with proper access policies
- Files organized by user ID

## Performance

- Code splitting by route
- Lazy loading for heavy components
- Optimistic UI updates
- Real-time sync without polling
- Service worker caching
- Optimized bundle size (~358KB JS, ~19KB CSS)

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome, Firefox)

## PWA Features

- Installable on desktop and mobile
- Offline support for cached data
- App-like navigation
- Custom splash screen
- Standalone display mode

## Future Enhancements

The architecture supports:
- Subscription billing
- Multi-company accounting
- Gold/Silver unit banking
- Approval workflows
- Advanced reporting and exports
- WhatsApp/Email sharing
- PDF and Excel exports
- Date range filtering
- Search functionality

## Support

For issues or questions about the application, please check the code comments and implementation details.

## License

Private - All Rights Reserved

---

Built with ❤️ using React, TypeScript, Supabase, and Vite
