import 'package:flutter/foundation.dart';
import 'api_service.dart';
import 'customer_storage.dart';

class CustomerProfile {
  final String id;
  final String name;
  final String? mobile;
  final String shopId;
  final String? houseNo;
  final String? floorNo;

  CustomerProfile({
    required this.id,
    required this.name,
    this.mobile,
    required this.shopId,
    this.houseNo,
    this.floorNo,
  });

  factory CustomerProfile.fromJson(Map<String, dynamic> json) {
    return CustomerProfile(
      id: json['id'] as String,
      name: json['name'] as String,
      mobile: json['mobile'] as String?,
      shopId: json['shopId'] as String,
      houseNo: json['houseNo'] as String?,
      floorNo: json['floorNo'] as String?,
    );
  }
}

/// Replaces Firebase Auth for the customer flow: identity is just a device-
/// issued id in secure storage. See PROJECT_PROMPT.md "Customer identity
/// trade-off".
class CustomerService extends ChangeNotifier {
  CustomerProfile? profile;
  bool loading = true;
  String? error;

  CustomerService() {
    _restore();
  }

  Future<void> _restore() async {
    try {
      final id = await CustomerStorage.readId();
      if (id == null) {
        loading = false;
        notifyListeners();
        return;
      }
      final data = await ApiService.getMe();
      profile = CustomerProfile.fromJson(data);
      error = null;
    } catch (_) {
      // Either no stored id, secure storage unavailable, or the stored id
      // is no longer valid (e.g. account deactivated) — fall back to the
      // registration form rather than get stuck. Best-effort clear; if
      // storage itself is what failed, this is a harmless no-op.
      await CustomerStorage.clear().catchError((_) {});
      profile = null;
      error = null;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> register({
    required String name,
    required String mobile,
    String? houseNo,
    String? floorNo,
  }) async {
    final data = await ApiService.registerCustomer(
      name: name,
      mobile: mobile,
      houseNo: houseNo,
      floorNo: floorNo,
    );
    await CustomerStorage.writeId(data['id'] as String);
    profile = CustomerProfile.fromJson(data);
    notifyListeners();
  }

  Future<void> signOut() async {
    await CustomerStorage.clear();
    profile = null;
    notifyListeners();
  }
}
