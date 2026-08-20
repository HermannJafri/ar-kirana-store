import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/providers/cart_provider.dart';
import 'package:mobile/screens/login_screen.dart';

void main() {
  testWidgets('LoginScreen renders username/password fields', (WidgetTester tester) async {
    // LoginScreen only needs CartProvider for the widget tree to build here
    // — AuthService needs a real Firebase app, which isn't available in a
    // plain widget test, so the full AuthGate isn't exercised.
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => CartProvider(),
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    expect(find.text('Log in'), findsWidgets);
    expect(find.widgetWithText(TextFormField, 'Username'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
  });
}
