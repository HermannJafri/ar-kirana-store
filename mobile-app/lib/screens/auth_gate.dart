import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import 'address_form_screen.dart';
import 'login_screen.dart';
import 'product_browse_screen.dart';

/// Everyone who opens this app is a customer (Staff/Owner use the web
/// dashboard; Delivery gets its own screens in Phase 5). Flow: not logged
/// in -> username/password login or signup; logged in but no saved address
/// -> address capture; both done -> straight to the product catalog, every
/// time, no re-entry of anything.
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

    if (!auth.profile!.hasAddress) {
      return const AddressFormScreen();
    }

    return const ProductBrowseScreen();
  }
}
