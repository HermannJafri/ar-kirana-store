import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'api_service.dart';

const _internalEmailDomain = 'internal.local';

/// Same pattern the dashboard uses for Staff/Owner: the customer only ever
/// sees/enters a username, never an email — Firebase still needs an email
/// under the hood, so we synthesize one. See PROJECT_PROMPT.md "Customer
/// identity trade-off".
String usernameToEmail(String username) => '${username.trim().toLowerCase()}@$_internalEmailDomain';

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

  Future<void> signIn(String username, String password) async {
    await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: usernameToEmail(username),
      password: password,
    );
  }

  Future<void> signUp({
    required String username,
    required String password,
    required String name,
    String? mobile,
  }) async {
    final credential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
      email: usernameToEmail(username),
      password: password,
    );
    if (credential.user == null) {
      throw Exception('Signup failed');
    }
    await ApiService.registerCustomer(name: name, username: username, mobile: mobile);
    await refreshProfile();
  }

  Future<void> signOut() => FirebaseAuth.instance.signOut();
}
