import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The device-issued customer id, persisted locally instead of a password.
/// See PROJECT_PROMPT.md "Customer identity trade-off" for why this is
/// acceptable for a small/trusted customer base and what it gives up.
class CustomerStorage {
  static const _storage = FlutterSecureStorage();
  static const _idKey = 'customer_id';

  static Future<String?> readId() => _storage.read(key: _idKey);
  static Future<void> writeId(String id) => _storage.write(key: _idKey, value: id);
  static Future<void> clear() => _storage.delete(key: _idKey);
}
