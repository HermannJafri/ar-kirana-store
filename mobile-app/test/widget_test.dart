import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/services/customer_service.dart';
import 'package:mobile/screens/profile_form_screen.dart';

void main() {
  testWidgets('ProfileFormScreen renders name/mobile/address fields', (WidgetTester tester) async {
    // CustomerService only needs its ChangeNotifier shape here — its
    // constructor kicks off an async storage read that's harmless in a
    // widget test (no backend call unless a stored id is found, which
    // there won't be).
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => CustomerService(),
        child: const MaterialApp(home: ProfileFormScreen()),
      ),
    );

    expect(find.text('Tell us about you'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Name'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Mobile number'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'House / Flat No (optional)'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Floor No (optional)'), findsOneWidget);
  });
}
