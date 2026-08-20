import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'providers/cart_provider.dart';
import 'screens/auth_gate.dart';
import 'services/customer_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');
  runApp(const KiranaStoreApp());
}

class KiranaStoreApp extends StatelessWidget {
  const KiranaStoreApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CustomerService()),
        ChangeNotifierProvider(create: (_) => CartProvider()),
      ],
      child: MaterialApp(
        title: 'Kirana Store',
        theme: ThemeData(colorSchemeSeed: Colors.green, useMaterial3: true),
        home: const AuthGate(),
      ),
    );
  }
}
