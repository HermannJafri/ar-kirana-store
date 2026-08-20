import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

/// Attaches the current Firebase ID token to every backend request. Every
/// read and write goes through the Express backend — see PROJECT_PROMPT.md
/// ("Why every data access goes through the backend"). Mirrors
/// dashboard/src/lib/api.ts's authFetch.
class ApiService {
  static String get _baseUrl => dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:4000';

  static Future<dynamic> _authFetch(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw ApiException('Not authenticated');

    final token = await user.getIdToken();
    final uri = Uri.parse('$_baseUrl$path');
    final headers = {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };

    late http.Response response;
    switch (method) {
      case 'POST':
        response = await http.post(uri, headers: headers, body: body != null ? jsonEncode(body) : null);
        break;
      case 'PATCH':
        response = await http.patch(uri, headers: headers, body: body != null ? jsonEncode(body) : null);
        break;
      case 'DELETE':
        response = await http.delete(uri, headers: headers);
        break;
      default:
        response = await http.get(uri, headers: headers);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message = 'Request failed (${response.statusCode})';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded['error'] is String) message = decoded['error'] as String;
      } catch (_) {}
      throw ApiException(message);
    }

    if (response.body.isEmpty) return null;
    return jsonDecode(response.body);
  }

  static Future<List<dynamic>> getProducts() async {
    final data = await _authFetch('/products');
    return data as List<dynamic>;
  }

  static Future<Map<String, dynamic>> getMe() async {
    final data = await _authFetch('/me');
    return data as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> register({required String name, String? phone}) async {
    final data = await _authFetch('/auth/register', method: 'POST', body: {
      'name': name,
      if (phone != null) 'phone': phone,
    });
    return data as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> placeOrder({
    required List<Map<String, dynamic>> items,
    String? deliveryAddress,
    String? notes,
  }) async {
    final data = await _authFetch('/orders', method: 'POST', body: {
      'items': items,
      if (deliveryAddress != null) 'deliveryAddress': deliveryAddress,
      if (notes != null) 'notes': notes,
    });
    return data as Map<String, dynamic>;
  }
}
