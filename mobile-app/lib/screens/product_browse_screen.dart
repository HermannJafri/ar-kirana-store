import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/product.dart';
import '../providers/cart_provider.dart';
import '../services/api_service.dart';
import '../services/customer_service.dart';
import 'cart_screen.dart';
import 'product_detail_screen.dart';

class ProductBrowseScreen extends StatefulWidget {
  const ProductBrowseScreen({super.key});

  @override
  State<ProductBrowseScreen> createState() => _ProductBrowseScreenState();
}

class _ProductBrowseScreenState extends State<ProductBrowseScreen> {
  List<Product> _products = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.getProducts();
      final products = data
          .map((e) => Product.fromJson(e as Map<String, dynamic>))
          .where((p) => p.isAvailable && p.quantityAvailable > 0)
          .toList();
      if (!mounted) return;
      setState(() => _products = products);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final itemCount = context.watch<CartProvider>().itemCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Products'),
        actions: [
          IconButton(
            tooltip: 'Log out',
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<CustomerService>().signOut(),
          ),
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CartScreen()),
                ),
              ),
              if (itemCount > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: CircleAvatar(
                    radius: 9,
                    backgroundColor: Colors.red,
                    child: Text('$itemCount', style: const TextStyle(fontSize: 11, color: Colors.white)),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
          const SizedBox(height: 12),
          Center(child: Text('Could not load products: $_error', textAlign: TextAlign.center)),
          const SizedBox(height: 12),
          Center(child: OutlinedButton(onPressed: _load, child: const Text('Retry'))),
        ],
      );
    }
    if (_products.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 120),
          Icon(Icons.storefront_outlined, size: 48, color: Colors.grey),
          SizedBox(height: 12),
          Center(child: Text('No products available right now.')),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _products.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final product = _products[index];
        return Card(
          child: ListTile(
            leading: product.imageUrl != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: Image.network(
                      product.imageUrl!,
                      width: 48,
                      height: 48,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const Icon(Icons.image_not_supported),
                    ),
                  )
                : const Icon(Icons.shopping_basket_outlined, size: 40),
            title: Text(product.name),
            subtitle: Text('₹${product.price.toStringAsFixed(2)}${product.unit != null ? ' / ${product.unit}' : ''}'),
            trailing: Text('Stock: ${product.quantityAvailable}'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ProductDetailScreen(product: product)),
            ),
          ),
        );
      },
    );
  }
}
