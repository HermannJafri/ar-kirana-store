import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/customer_service.dart';

/// First-launch screen: no password, just enough to identify and deliver to
/// this customer. See PROJECT_PROMPT.md "Customer identity trade-off".
class ProfileFormScreen extends StatefulWidget {
  const ProfileFormScreen({super.key});

  @override
  State<ProfileFormScreen> createState() => _ProfileFormScreenState();
}

class _ProfileFormScreenState extends State<ProfileFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _mobileController = TextEditingController();
  final _houseNoController = TextEditingController();
  final _floorNoController = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<CustomerService>().register(
            name: _nameController.text.trim(),
            mobile: _mobileController.text.trim(),
            houseNo: _houseNoController.text.trim().isEmpty ? null : _houseNoController.text.trim(),
            floorNo: _floorNoController.text.trim().isEmpty ? null : _floorNoController.text.trim(),
          );
      // On success CustomerService.profile is set — AuthGate will rebuild
      // to the product browse screen on its own, nothing to navigate here.
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _mobileController.dispose();
    _houseNoController.dispose();
    _floorNoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kirana Store')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Tell us about you', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(
                  "We'll use this to deliver your orders — no password needed.",
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
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _mobileController,
                  decoration: const InputDecoration(labelText: 'Mobile number', border: OutlineInputBorder()),
                  keyboardType: TextInputType.phone,
                  validator: (v) {
                    final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                    if (digits.length < 10) return 'Enter a valid mobile number';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _houseNoController,
                  decoration: const InputDecoration(
                    labelText: 'House / Flat No (optional)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _floorNoController,
                  decoration: const InputDecoration(labelText: 'Floor No (optional)', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Continue'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
