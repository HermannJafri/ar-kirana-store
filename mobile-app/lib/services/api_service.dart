import 'dart:convert';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'customer_storage.dart';

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

/// Attaches the device-issued customer id (X-Customer-Id) to every backend
/// request instead of a Firebase token — see PROJECT_PROMPT.md "Customer
/// identity trade-off". Mirrors dashboard/src/lib/api.ts's authFetch, minus
/// the token.
class ApiService {
  static String get _baseUrl => dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:4000';

  static Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    bool requireAuth = true,
  }) async {
    final headers = {'Content-Type': 'application/json'};

    if (requireAuth) {
      final customerId = await CustomerStorage.readId();
      if (customerId == null) throw ApiException('Not registered on this device');
      headers['X-Customer-Id'] = customerId;
    }

    final uri = Uri.parse('$_baseUrl$path');
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
    final data = await _request('/products');
    return data as List<dynamic>;
  }

  static Future<Map<String, dynamic>> getMe() async {
    final data = await _request('/me');
    return data as Map<String, dynamic>;
  }

  // No stored id yet at this point — this call establishes one.
  static Future<Map<String, dynamic>> registerCustomer({
    required String name,
    required String mobile,
    String? houseNo,
    String? floorNo,
  }) async {
    final data = await _request(
      '/auth/register',
      method: 'POST',
      requireAuth: false,
      body: {
        'name': name,
        'mobile': mobile,
        if (houseNo != null) 'houseNo': houseNo,
        if (floorNo != null) 'floorNo': floorNo,
      },
    );
    return data as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> placeOrder({
    required List<Map<String, dynamic>> items,
    String? deliveryAddress,
    String? notes,
  }) async {
    final data = await _request('/orders', method: 'POST', body: {
      'items': items,
      if (deliveryAddress != null) 'deliveryAddress': deliveryAddress,
      if (notes != null) 'notes': notes,
    });
    return data as Map<String, dynamic>;
  }
}
