import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/customer_service.dart';
import 'product_browse_screen.dart';
import 'profile_form_screen.dart';

/// Everyone who opens this app is a customer (Staff/Owner use the web
/// dashboard; Delivery gets its own Firebase-based login in Phase 5). No
/// account yet -> show the registration form. Account restored from device
/// storage -> straight to browsing, no login step at all.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final customer = context.watch<CustomerService>();

    if (customer.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (customer.profile == null) {
      return const ProfileFormScreen();
    }

    return const ProductBrowseScreen();
  }
}
