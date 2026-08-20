import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import 'login_screen.dart';
import 'product_browse_screen.dart';

/// Role-based routing after login, same pattern as
/// dashboard/src/app/(dashboard)/layout.tsx. Only CUSTOMER is built so far
/// (Phase 3) — DELIVERY screens are Phase 5, OWNER/STAFF use the dashboard.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    if (auth.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (auth.firebaseUser == null) {
      return const LoginScreen();
    }

    if (auth.error != null || auth.profile == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Could not load your account: ${auth.error ?? "unknown error"}'),
                const SizedBox(height: 16),
                OutlinedButton(onPressed: () => auth.refreshProfile(), child: const Text('Retry')),
                TextButton(onPressed: () => auth.signOut(), child: const Text('Log out')),
              ],
            ),
          ),
        ),
      );
    }

    final role = auth.profile!.role;
    if (role == 'CUSTOMER') {
      return const ProductBrowseScreen();
    }

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                role == 'DELIVERY'
                    ? 'Delivery screens are coming soon.'
                    : 'Staff and Owner accounts use the web dashboard, not this app.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              TextButton(onPressed: () => auth.signOut(), child: const Text('Log out')),
            ],
          ),
        ),
      ),
    );
  }
}
