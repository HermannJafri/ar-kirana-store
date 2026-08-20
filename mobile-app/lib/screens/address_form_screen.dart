import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';

/// Shown once, right after signup/first login, until the customer has a
/// saved address — see PROJECT_PROMPT.md "Customer identity trade-off" for
/// why this uses raw on-device GPS instead of a geocoding API, and how the
/// backend validates it against the shop's delivery radius without this
/// screen ever seeing the shop's coordinates or the computed distance.
class AddressFormScreen extends StatefulWidget {
  const AddressFormScreen({super.key});

  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  final _houseNoController = TextEditingController();
  final _floorNoController = TextEditingController();
  final _areaController = TextEditingController();

  double? _latitude;
  double? _longitude;
  bool _locating = false;
  bool _submitting = false;
  String? _error;

  Future<void> _captureLocation() async {
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception('Location services are turned off on this device.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw Exception('Location permission is required to check delivery availability.');
      }

      final position = await Geolocator.getCurrentPosition();
      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _submit() async {
    if (_latitude == null || _longitude == null) {
      setState(() => _error = 'Capture your location first.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiService.submitAddress(
        houseNo: _houseNoController.text.trim(),
        floorNo: _floorNoController.text.trim(),
        area: _areaController.text.trim(),
        latitude: _latitude!,
        longitude: _longitude!,
      );
      if (!mounted) return;
      // Address is now saved server-side — refresh the profile so AuthGate
      // sees hasAddress == true and moves on to the product catalog.
      await context.read<AuthService>().refreshProfile();
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _houseNoController.dispose();
    _floorNoController.dispose();
    _areaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Delivery address')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Where should we deliver?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(
                "We use your location to confirm we deliver to your area — it's not shared or shown anywhere.",
                style: TextStyle(color: Colors.grey.shade600),
              ),
              const SizedBox(height: 24),
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    border: Border.all(color: Colors.red.shade200),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                ),
                const SizedBox(height: 16),
              ],
              TextField(
                controller: _houseNoController,
                decoration: const InputDecoration(labelText: 'House / Flat No', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _floorNoController,
                decoration: const InputDecoration(labelText: 'Floor No', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _areaController,
                decoration: const InputDecoration(labelText: 'Area / Locality', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: _locating ? null : _captureLocation,
                icon: _locating
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(_latitude != null ? Icons.check_circle : Icons.my_location,
                        color: _latitude != null ? Colors.green : null),
                label: Text(_latitude != null ? 'Location captured' : 'Use my current location'),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
