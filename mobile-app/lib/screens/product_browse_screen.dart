import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/product.dart';
import '../providers/cart_provider.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import 'cart_screen.dart';
import 'my_orders_screen.dart';
import 'product_detail_screen.dart';

const String _allCategoryId = 'all';
const String _uncategorizedId = 'uncategorized';

class ProductBrowseScreen extends StatefulWidget {
  const ProductBrowseScreen({super.key});

  @override
  State<ProductBrowseScreen> createState() => _ProductBrowseScreenState();
}

class _ProductBrowseScreenState extends State<ProductBrowseScreen> {
  List<Product> _products = [];
  List<Category> _categories = [];
  String _activeCategoryId = _allCategoryId;
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
      final results = await Future.wait([
        ApiService.getProducts(),
        ApiService.getCategories(),
      ]);
      final products = results[0]
          .map((e) => Product.fromJson(e as Map<String, dynamic>))
          .where((p) => p.isAvailable && p.quantityAvailable > 0)
          .toList();
      final categories = results[1]
          .map((e) => Category.fromJson(e as Map<String, dynamic>))
          .toList();
      if (!mounted) return;
      setState(() {
        _products = products;
        _categories = categories;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Product> get _filteredProducts {
    if (_activeCategoryId == _allCategoryId) return _products;
    if (_activeCategoryId == _uncategorizedId) {
      return _products.where((p) => p.category == null).toList();
    }
    return _products.where((p) => p.category?.id == _activeCategoryId).toList();
  }

  @override
  Widget build(BuildContext context) {
    final itemCount = context.watch<CartProvider>().itemCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Products'),
        actions: [
          IconButton(
            tooltip: 'My orders',
            icon: const Icon(Icons.receipt_long_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MyOrdersScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Log out',
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AuthService>().signOut(),
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

    final hasUncategorized = _products.any((p) => p.category == null);
    final filtered = _filteredProducts;

    return Column(
      children: [
        if (_categories.isNotEmpty)
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              children: [
                _categoryChip(_allCategoryId, 'All'),
                const SizedBox(width: 8),
                for (final category in _categories) ...[
                  _categoryChip(category.id, category.name),
                  const SizedBox(width: 8),
                ],
                if (hasUncategorized) _categoryChip(_uncategorizedId, 'Uncategorized'),
              ],
            ),
          ),
        Expanded(
          child: filtered.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 120),
                    Center(child: Text('No products in this category.')),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final product = filtered[index];
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
                        subtitle: Text(
                            '₹${product.price.toStringAsFixed(2)}${product.unit != null ? ' / ${product.unit}' : ''}'),
                        trailing: Text('Stock: ${product.quantityAvailable}'),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => ProductDetailScreen(product: product)),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _categoryChip(String id, String label) {
    final selected = _activeCategoryId == id;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => setState(() => _activeCategoryId = id),
    );
  }
}
