import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'api_service.dart';

const _internalEmailDomain = 'internal.local';

/// The customer only ever sees/enters a mobile number, never an email —
/// Firebase still needs an email under the hood, so we synthesize one from
/// the digits of the mobile number (revised 2026-08-21, was username-based).
/// See PROJECT_PROMPT.md "Customer identity trade-off".
String mobileToEmail(String mobile) =>
    '${mobile.replaceAll(RegExp(r'[^0-9]'), '')}@$_internalEmailDomain';

class CustomerProfile {
  final String id;
  final String name;
  final String? username;
  final String? mobile;
  final String shopId;
  final String? houseNo;
  final String? floorNo;
  final String? area;
  final double? latitude;
  final double? longitude;

  bool get hasAddress => latitude != null && longitude != null;

  CustomerProfile({
    required this.id,
    required this.name,
    this.username,
    this.mobile,
    required this.shopId,
    this.houseNo,
    this.floorNo,
    this.area,
    this.latitude,
    this.longitude,
  });

  factory CustomerProfile.fromJson(Map<String, dynamic> json) {
    return CustomerProfile(
      id: json['id'] as String,
      name: json['name'] as String,
      username: json['username'] as String?,
      mobile: json['mobile'] as String?,
      shopId: json['shopId'] as String,
      houseNo: json['houseNo'] as String?,
      floorNo: json['floorNo'] as String?,
      area: json['area'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
    );
  }
}

/// Mirrors dashboard/src/context/AuthContext.tsx, including the fix for the
/// login race condition found there: as soon as a Firebase user is known,
/// `loading` is set true again *before* the async /me fetch, so consumers
/// never see a stale "logged out" state while the profile is loading.
class AuthService extends ChangeNotifier {
  User? firebaseUser;
  CustomerProfile? profile;
  bool loading = true;
  String? error;

  AuthService() {
    FirebaseAuth.instance.idTokenChanges().listen(_onIdTokenChanged);
  }

  Future<void> _onIdTokenChanged(User? user) async {
    if (user == null) {
      firebaseUser = null;
      profile = null;
      loading = false;
      error = null;
      notifyListeners();
      return;
    }

    firebaseUser = user;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await ApiService.getMe();
      profile = CustomerProfile.fromJson(data);
      error = null;
    } catch (e) {
      profile = null;
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refreshProfile() => _onIdTokenChanged(FirebaseAuth.instance.currentUser);

  Future<void> signIn(String mobile, String password) async {
    await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: mobileToEmail(mobile),
      password: password,
    );
  }

  Future<void> signUp({
    required String mobile,
    required String password,
    required String name,
    String? username,
  }) async {
    final credential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
      email: mobileToEmail(mobile),
      password: password,
    );
    if (credential.user == null) {
      throw Exception('Signup failed');
    }
    try {
      await ApiService.registerCustomer(name: name, mobile: mobile, username: username);
    } catch (e) {
      // Backend registration failed (e.g. mobile already registered) — the
      // Firebase account from above must not be left behind as an orphan,
      // or it'll block every future signup attempt with this mobile number
      // ("email already in use") with no corresponding customer record to
      // show for it. Best-effort: if this delete itself fails, the original
      // registration error is still what the caller needs to see.
      try {
        await credential.user!.delete();
      } catch (_) {}
      rethrow;
    }
    await refreshProfile();
  }

  Future<void> signOut() => FirebaseAuth.instance.signOut();
}
