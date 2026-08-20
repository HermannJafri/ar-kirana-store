import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'api_service.dart';

class Profile {
  final String id;
  final String shopId;
  final String role;
  final String name;
  final String? email;
  final bool isActive;

  Profile({
    required this.id,
    required this.shopId,
    required this.role,
    required this.name,
    this.email,
    required this.isActive,
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    return Profile(
      id: json['id'] as String,
      shopId: json['shopId'] as String,
      role: json['role'] as String,
      name: json['name'] as String,
      email: json['email'] as String?,
      isActive: json['isActive'] as bool,
    );
  }
}

/// Mirrors dashboard/src/context/AuthContext.tsx, including the fix for the
/// login race condition found there: as soon as a Firebase user is known,
/// `loading` is set true again *before* the async /me fetch, so consumers
/// never see a stale "logged out" state while the profile is loading.
class AuthService extends ChangeNotifier {
  User? firebaseUser;
  Profile? profile;
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
      profile = Profile.fromJson(data);
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

  Future<void> signIn(String email, String password) async {
    await FirebaseAuth.instance.signInWithEmailAndPassword(email: email, password: password);
  }

  Future<void> signUp(String email, String password, String name) async {
    final credential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
      email: email,
      password: password,
    );
    if (credential.user == null) {
      throw Exception('Signup failed');
    }
    await ApiService.register(name: name);
    await refreshProfile();
  }

  Future<void> signOut() => FirebaseAuth.instance.signOut();
}
